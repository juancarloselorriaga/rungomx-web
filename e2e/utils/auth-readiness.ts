import { type Page } from '@playwright/test';
import { emitDiagnostic } from './diagnostics';

export type DestinationPattern =
  | string
  | RegExp
  | ((context: { pathname: string; normalizedPathname: string; url: string }) => boolean);

export type AuthReadinessStatus = 'destination' | 'role-modal' | 'profile-modal';

type AuthReadinessPollStatus = AuthReadinessStatus | 'pending';

type WaitForAuthReadinessOptions = {
  expectedDestinations: DestinationPattern[];
  timeoutMs?: number;
  context?: string;
};

export type AuthReadinessState = {
  status: AuthReadinessPollStatus;
  url: string;
  pathname: string;
  normalizedPathname: string;
  matchedDestination: string | null;
};

const SIGN_IN_PATH_REGEX = /\/sign-in(?:\/|$)/i;
const DEFAULT_AUTH_READY_TIMEOUT_MS = 45_000;

function isReadyStatus(status: AuthReadinessPollStatus): status is AuthReadinessStatus {
  return status !== 'pending';
}

export function normalizePathname(pathname: string) {
  const normalized = pathname.replace(/^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/|$)/, '');
  return normalized.length > 0 ? normalized : '/';
}

function describeDestinationPattern(pattern: DestinationPattern) {
  if (typeof pattern === 'string') return pattern;
  if (pattern instanceof RegExp) return pattern.toString();
  return '[function-pattern]';
}

export function matchesDestinationPattern(
  pattern: DestinationPattern,
  context: { pathname: string; normalizedPathname: string; url: string },
) {
  if (typeof pattern === 'string') {
    return (
      context.pathname.includes(pattern) ||
      context.normalizedPathname.includes(pattern) ||
      context.url.includes(pattern)
    );
  }
  if (pattern instanceof RegExp) {
    return pattern.test(context.pathname) || pattern.test(context.normalizedPathname) || pattern.test(context.url);
  }
  return pattern(context);
}

export async function getAuthReadinessState(
  page: Page,
  expectedDestinations: DestinationPattern[],
): Promise<AuthReadinessState> {
  const url = page.url();

  let pathname = '/';
  try {
    pathname = new URL(url).pathname || '/';
  } catch {
    pathname = '/';
  }
  const normalizedPathname = normalizePathname(pathname);

  const roleModal = page.getByText('Choose your role to continue');
  if (await roleModal.isVisible({ timeout: 100 }).catch(() => false)) {
    return {
      status: 'role-modal',
      url,
      pathname,
      normalizedPathname,
      matchedDestination: null,
    };
  }

  const profileModal = page.getByText('Complete your profile to continue');
  if (await profileModal.isVisible({ timeout: 100 }).catch(() => false)) {
    return {
      status: 'profile-modal',
      url,
      pathname,
      normalizedPathname,
      matchedDestination: null,
    };
  }

  const patternContext = { pathname, normalizedPathname, url };
  for (const pattern of expectedDestinations) {
    if (matchesDestinationPattern(pattern, patternContext)) {
      return {
        status: 'destination',
        url,
        pathname,
        normalizedPathname,
        matchedDestination: describeDestinationPattern(pattern),
      };
    }
  }

  const looksLikeSignIn = SIGN_IN_PATH_REGEX.test(pathname) || SIGN_IN_PATH_REGEX.test(normalizedPathname);
  if (looksLikeSignIn) {
    return {
      status: 'pending',
      url,
      pathname,
      normalizedPathname,
      matchedDestination: null,
    };
  }

  return {
    status: 'pending',
    url,
    pathname,
    normalizedPathname,
    matchedDestination: null,
  };
}

export async function waitForAuthReadiness(
  page: Page,
  {
    expectedDestinations,
    timeoutMs = DEFAULT_AUTH_READY_TIMEOUT_MS,
    context = 'auth',
  }: WaitForAuthReadinessOptions,
): Promise<AuthReadinessState> {
  if (expectedDestinations.length === 0) {
    throw new Error('[auth-readiness] expectedDestinations cannot be empty.');
  }

  const expectedDescription = expectedDestinations.map(describeDestinationPattern);
  emitDiagnostic('auth.readiness.wait.start', {
    context,
    expectedDestinations: expectedDescription,
    timeoutMs,
    currentUrl: page.url(),
  });

  let lastState: AuthReadinessState | null = null;
  const pollIntervalsMs = [100, 250, 500, 1000];
  const startedAt = Date.now();
  let pollAttempt = 0;

  try {
    while (Date.now() - startedAt <= timeoutMs) {
      lastState = await getAuthReadinessState(page, expectedDestinations);
      if (isReadyStatus(lastState.status)) {
        emitDiagnostic('auth.readiness.wait.ready', {
          context,
          status: lastState.status,
          url: lastState.url,
          normalizedPathname: lastState.normalizedPathname,
          matchedDestination: lastState.matchedDestination,
        });

        return lastState;
      }

      const elapsedMs = Date.now() - startedAt;
      const remainingMs = timeoutMs - elapsedMs;
      if (remainingMs <= 0) break;

      const intervalMs = pollIntervalsMs[Math.min(pollAttempt, pollIntervalsMs.length - 1)];
      await page.waitForTimeout(Math.min(intervalMs, remainingMs));
      pollAttempt += 1;
    }
  } catch (error) {
    emitDiagnostic(
      'auth.readiness.wait.failed',
      {
        context,
        expectedDestinations: expectedDescription,
        lastState,
      },
      'error',
    );
    const failureUrl = lastState?.url ?? page.url();
    const failurePath = lastState?.normalizedPathname ?? 'unknown';
    throw new Error(
      `[auth-readiness] ${context} did not reach a ready state within ${timeoutMs}ms. ` +
        `Expected one of: ${expectedDescription.join(', ')}. ` +
        `Last URL: ${failureUrl} (path=${failurePath}).`,
      error instanceof Error ? { cause: error } : undefined,
    );
  }

  emitDiagnostic(
    'auth.readiness.wait.failed',
    {
      context,
      expectedDestinations: expectedDescription,
      timeoutMs,
      lastState,
    },
    'error',
  );
  const failureUrl = lastState?.url ?? page.url();
  const failurePath = lastState?.normalizedPathname ?? 'unknown';
  throw new Error(
    `[auth-readiness] ${context} did not reach a ready state within ${timeoutMs}ms. ` +
      `Expected one of: ${expectedDescription.join(', ')}. ` +
      `Last URL: ${failureUrl} (path=${failurePath}).`,
  );
}
