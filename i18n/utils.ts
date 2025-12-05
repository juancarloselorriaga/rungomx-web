import { AsyncLocalStorage } from 'node:async_hooks';
import { cacheLife, cacheTag } from 'next/cache';
import { z } from 'zod';
import { routing, type AppLocale } from './routing';
import {
  type Messages,
  componentsSchema,
  messagesSchema,
  pagesSchema,
  rootAuthSchema,
  rootCommonSchema,
  rootErrorsSchema,
  rootNavigationSchema,
  rootEmailsSchema,
} from './types';
import {
  rootNamespaceLoaders,
  componentNamespaceLoaders,
  pageNamespaceLoaders,
  generatedRouteNamespaceMap,
  manualRouteOverrides,
  type NamespaceLoader,
  type NamespaceSelection,
} from './loaders.generated';

type ParsedIssue = { path: PropertyKey[]; message: string };

// Merge generated and manual route maps (manual takes precedence)
const routeNamespaceMap: Record<string, NamespaceSelection> = {
  ...generatedRouteNamespaceMap,
  ...manualRouteOverrides,
};

// Derive constants from generated loaders
const DEFAULT_BASE_NAMESPACES = Object.keys(
  rootNamespaceLoaders
) as (keyof typeof rootNamespaceLoaders)[];
const DEFAULT_COMPONENT_NAMESPACES = Object.keys(
  componentNamespaceLoaders
) as (keyof typeof componentNamespaceLoaders)[];
const ALL_PAGES = Object.keys(pageNamespaceLoaders) as (keyof typeof pageNamespaceLoaders)[];

const FULL_SELECTION: NamespaceSelection = {
  base: DEFAULT_BASE_NAMESPACES,
  components: DEFAULT_COMPONENT_NAMESPACES,
  pages: ALL_PAGES,
};

const localePathLookup = buildLocalePathLookup();
// Tracks the current route context across loader call sites so request-time config
// and layout rendering can share the resolved pathname/messages for the same request.
const routeContext = new AsyncLocalStorage<{ pathname: string; messages?: Messages }>();

export const ROUTE_MESSAGES_BYTE_LIMIT = 11000;
export const isValidLocale = (value: string): value is AppLocale =>
  routing.locales.includes(value as AppLocale);

const formatZodIssues = (issues: ParsedIssue[]) =>
  issues
    .map((issue) => {
      const path = issue.path.map(String).join('.') || '<root>';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

const loadNamespaceGroup = async <const TLoaders extends Record<string, NamespaceLoader<unknown>>>(
  locale: AppLocale,
  loaders: TLoaders
) => {
  const entries = await Promise.all(
    Object.entries(loaders).map(
      async ([key, loader]) => [key, await loader(locale)] as const
    )
  );

  return Object.fromEntries(entries) as {
    [K in keyof TLoaders]: Awaited<ReturnType<TLoaders[K]>>;
  };
};

const rootSchemas = {
  common: rootCommonSchema,
  navigation: rootNavigationSchema,
  auth: rootAuthSchema,
  errors: rootErrorsSchema,
  emails: rootEmailsSchema,
} as const;

export function validateMessages(locale: string, raw: unknown): Messages {
  const result = messagesSchema.safeParse(raw);

  if (!result.success) {
    const formattedIssues = formatZodIssues(result.error.issues);
    throw new Error(`Invalid messages for locale "${locale}": ${formattedIssues}`);
  }

  return result.data;
}

function pickLoaders<TLoaders, TKey extends keyof TLoaders>(
  loaders: TLoaders,
  keys: readonly TKey[]
) {
  return keys.reduce(
    (acc, key) => ({ ...acc, [key]: loaders[key] }),
    {} as Pick<TLoaders, TKey>
  );
}

function normalizePathname(pathname: string | undefined): string {
  if (!pathname) return '/';
  const withoutQuery = pathname.split('?')[0]?.split('#')[0] ?? '';
  const ensuredLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const trimmed =
    ensuredLeadingSlash !== '/' ? ensuredLeadingSlash.replace(/\/+$/, '') || '/' : '/';
  const segments = trimmed
    .split('/')
    .filter(Boolean)
    // Drop route groups "(...)" and dynamic placeholders "[...]"
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
    .filter((segment) => !(segment.startsWith('[') && segment.endsWith(']')));

  if (segments.length > 0 && routing.locales.includes(segments[0] as AppLocale)) {
    segments.shift();
  }

  const localized = `/${segments.join('/')}`;
  return localePathLookup[localized] ?? (segments.length ? localized : '/');
}

function buildLocalePathLookup() {
  const lookup: Record<string, string> = {};

  Object.entries(routing.pathnames).forEach(([canonical, localized]) => {
    if (typeof localized === 'string') {
      lookup[localized] = canonical;
    } else {
      Object.values(localized).forEach((path) => {
        lookup[path] = canonical;
      });
    }
  });

  return lookup;
}

export function rememberRoutePath(pathname: string) {
  const normalized = normalizePathname(pathname);
  setRouteContext(normalized);
  return normalized;
}

export function getRequestPathname(): string {
  const existing = routeContext.getStore();
  if (existing?.pathname) {
    return existing.pathname;
  }

  const normalized = normalizePathname('/');
  setRouteContext(normalized);
  return normalized;
}

export function getStoredRoutePathname(): string | undefined {
  return routeContext.getStore()?.pathname;
}

function resolveRouteNamespaces(pathname: string): NamespaceSelection {
  const normalized = normalizePathname(pathname);
  return (
    routeNamespaceMap[normalized] ?? {
      base: DEFAULT_BASE_NAMESPACES,
      components: DEFAULT_COMPONENT_NAMESPACES,
      pages: [],
    }
  );
}

function makePickRecord<TKeys extends readonly string[]>(keys: TKeys) {
  return keys.reduce(
    (acc, key) => ({ ...acc, [key]: true }),
    {} as Record<TKeys[number], true>
  );
}

function buildSchema(selection: NamespaceSelection) {
  const shape: Record<string, z.ZodTypeAny> = {};

  selection.base.forEach((key) => {
    shape[key] = rootSchemas[key];
  });

  if (selection.components.length) {
    shape.components = componentsSchema.pick(makePickRecord(selection.components));
  }

  if (selection.pages.length) {
    shape.pages = pagesSchema.pick(makePickRecord(selection.pages));
  }

  return z.object(shape).strict();
}

function isFullSelection(selection: NamespaceSelection) {
  return (
    selection.base.length === FULL_SELECTION.base.length &&
    selection.components.length === FULL_SELECTION.components.length &&
    selection.pages.length === FULL_SELECTION.pages.length &&
    selection.base.every((ns, index) => ns === FULL_SELECTION.base[index]) &&
    selection.components.every((ns, index) => ns === FULL_SELECTION.components[index]) &&
    selection.pages.every((ns, index) => ns === FULL_SELECTION.pages[index])
  );
}

function validateSelectedMessages(
  locale: string,
  selection: NamespaceSelection,
  raw: unknown
): Messages {
  const schema = isFullSelection(selection) ? messagesSchema : buildSchema(selection);
  const result = schema.safeParse(raw);

  if (!result.success) {
    const formattedIssues = formatZodIssues(result.error.issues as ParsedIssue[]);
    throw new Error(`Invalid messages for locale "${locale}": ${formattedIssues}`);
  }

  return result.data as Messages;
}

function setRouteContext(pathname: string, messages?: Messages) {
  const current = routeContext.getStore();
  if (current) {
    current.pathname = pathname;
    if (messages) current.messages = messages;
    return;
  }

  routeContext.enterWith({ pathname, messages });
}

function assertPayloadSize(messages: Messages, pathname: string) {
  const size = Buffer.byteLength(JSON.stringify(messages));
  const warnThreshold = Math.floor(ROUTE_MESSAGES_BYTE_LIMIT * 0.8);

  if (size > warnThreshold && size <= ROUTE_MESSAGES_BYTE_LIMIT) {
    // Soft warning to make oversized payloads visible during development
    console.warn(
      `[i18n] Serialized messages for "${pathname}" approaching limit (${size}/${ROUTE_MESSAGES_BYTE_LIMIT} bytes).`
    );
  }

  if (size > ROUTE_MESSAGES_BYTE_LIMIT) {
    throw new Error(
      `Serialized messages for "${pathname}" exceed ${ROUTE_MESSAGES_BYTE_LIMIT} bytes (got ${size}).`
    );
  }

  return size;
}

async function loadMessagesForSelection(
  locale: AppLocale,
  selection: NamespaceSelection
): Promise<Messages> {
  'use cache';
  cacheTag('i18n-messages', `i18n-${locale}`);
  cacheLife('weeks');

  const [baseNamespaces, componentNamespaces, pageNamespaces] = await Promise.all([
    loadNamespaceGroup(locale, pickLoaders(rootNamespaceLoaders, selection.base)),
    selection.components.length
      ? loadNamespaceGroup(locale, pickLoaders(componentNamespaceLoaders, selection.components))
      : Promise.resolve({}),
    selection.pages.length
      ? loadNamespaceGroup(locale, pickLoaders(pageNamespaceLoaders, selection.pages))
      : Promise.resolve({}),
  ]);

  const merged = {
    ...baseNamespaces,
    ...(selection.components.length && { components: componentNamespaces }),
    ...(selection.pages.length && { pages: pageNamespaces }),
  };

  return validateSelectedMessages(locale, selection, merged);
}

export async function loadMessages(locale: AppLocale): Promise<Messages> {
  return loadMessagesForSelection(locale, FULL_SELECTION);
}

/**
 * Load only the namespaces mapped to a specific route.
 *
 * - Normalizes the incoming pathname (handles locale prefixes and localized pathnames)
 * - Reuses messages stored in AsyncLocalStorage for the current request if available
 * - Validates the selected namespaces against partial schemas
 * - Enforces payload-size guardrails before returning
 */
export async function loadRouteMessages(
  locale: AppLocale,
  pathname: string
): Promise<Messages> {
  const normalizedPath = normalizePathname(pathname);
  const existing = routeContext.getStore();
  if (existing?.messages && existing.pathname === normalizedPath) {
    return existing.messages;
  }

  const selection = resolveRouteNamespaces(normalizedPath);
  const messages = await loadMessagesForSelection(locale, selection);

  assertPayloadSize(messages, normalizedPath);
  setRouteContext(normalizedPath, messages);
  return messages;
}
