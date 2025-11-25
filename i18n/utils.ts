import { routing, type AppLocale } from './routing';
import { messagesSchema, type Messages } from './types';

/**
 * Type guard to check if a value is a valid locale
 * @param value - The value to check
 * @returns True if the value is a valid AppLocale
 */
export const isValidLocale = (value: string): value is AppLocale =>
  routing.locales.includes(value as AppLocale);

type ParsedIssue = { path: PropertyKey[]; message: string };

const formatZodIssues = (issues: ParsedIssue[]) =>
  issues
    .map((issue) => {
      const path = issue.path.map(String).join('.') || '<root>';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

type NamespaceLoader<T> = (locale: AppLocale) => Promise<T>;

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

/**
 * Validate a messages object against the schema, providing actionable errors.
 */
export function validateMessages(locale: string, raw: unknown): Messages {
  const result = messagesSchema.safeParse(raw);

  if (!result.success) {
    const formattedIssues = formatZodIssues(result.error.issues);
    throw new Error(`Invalid messages for locale "${locale}": ${formattedIssues}`);
  }

  return result.data;
}

/**
 * Load and validate locale messages at runtime.
 */
export async function loadMessages(locale: AppLocale): Promise<Messages> {
  const rootNamespacesPromise = loadNamespaceGroup(locale, {
    common: (targetLocale) => import(`@/messages/common/${targetLocale}.json`).then((mod) => mod.default),
    navigation: (targetLocale) =>
      import(`@/messages/navigation/${targetLocale}.json`).then((mod) => mod.default),
    auth: (targetLocale) => import(`@/messages/auth/${targetLocale}.json`).then((mod) => mod.default),
    errors: (targetLocale) => import(`@/messages/errors/${targetLocale}.json`).then((mod) => mod.default),
  });

  const componentsPromise = loadNamespaceGroup(locale, {
    footer: (targetLocale) =>
      import(`@/messages/components/footer/${targetLocale}.json`).then((mod) => mod.default),
    themeSwitcher: (targetLocale) =>
      import(`@/messages/components/theme-switcher/${targetLocale}.json`).then((mod) => mod.default),
    errorBoundary: (targetLocale) =>
      import(`@/messages/components/error-boundary/${targetLocale}.json`).then((mod) => mod.default),
    localeSwitcher: (targetLocale) =>
      import(`@/messages/components/locale-switcher/${targetLocale}.json`).then((mod) => mod.default),
  });

  const pagesPromise = loadNamespaceGroup(locale, {
    home: (targetLocale) => import(`@/messages/pages/home/${targetLocale}.json`).then((mod) => mod.default),
    about: (targetLocale) => import(`@/messages/pages/about/${targetLocale}.json`).then((mod) => mod.default),
    contact: (targetLocale) =>
      import(`@/messages/pages/contact/${targetLocale}.json`).then((mod) => mod.default),
    events: (targetLocale) => import(`@/messages/pages/events/${targetLocale}.json`).then((mod) => mod.default),
    news: (targetLocale) => import(`@/messages/pages/news/${targetLocale}.json`).then((mod) => mod.default),
    results: (targetLocale) =>
      import(`@/messages/pages/results/${targetLocale}.json`).then((mod) => mod.default),
    help: (targetLocale) => import(`@/messages/pages/help/${targetLocale}.json`).then((mod) => mod.default),
    dashboard: (targetLocale) =>
      import(`@/messages/pages/dashboard/${targetLocale}.json`).then((mod) => mod.default),
    profile: (targetLocale) =>
      import(`@/messages/pages/profile/${targetLocale}.json`).then((mod) => mod.default),
    settings: (targetLocale) =>
      import(`@/messages/pages/settings/${targetLocale}.json`).then((mod) => mod.default),
    team: (targetLocale) => import(`@/messages/pages/team/${targetLocale}.json`).then((mod) => mod.default),
    signIn: (targetLocale) =>
      import(`@/messages/pages/sign-in/${targetLocale}.json`).then((mod) => mod.default),
    signUp: (targetLocale) =>
      import(`@/messages/pages/sign-up/${targetLocale}.json`).then((mod) => mod.default),
  });

  const [rootNamespaces, components, pages] = await Promise.all([
    rootNamespacesPromise,
    componentsPromise,
    pagesPromise,
  ]);

  return validateMessages(locale, {
    ...rootNamespaces,
    components,
    pages,
  });
}
