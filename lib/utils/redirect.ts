export function normalizeCallbackPath(callbackURL?: string): string | undefined {
  if (!callbackURL) return undefined;

  if (callbackURL.startsWith('/')) return callbackURL;

  try {
    const url = new URL(callbackURL);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

/**
 * next-intl's router helpers expect "internal" (non-localized) paths.
 * If we pass a path that already contains a locale prefix (e.g. "/en/dashboard"),
 * next-intl may apply the locale prefix again, producing "/en/en/dashboard".
 */
export function stripLeadingLocaleFromPath(path: string): string {
  // Avoid importing routing/next-intl types here; keep this utility lightweight.
  const LOCALES = ['en', 'es'] as const;

  if (!path.startsWith('/')) return path;

  try {
    const url = new URL(path, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length > 0 && LOCALES.includes(parts[0] as (typeof LOCALES)[number])) {
      parts.shift();
      url.pathname = `/${parts.join('/')}`;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path;
  }
}

export function isSafeRedirectPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.includes('\\')) return false;
  if (path.includes('\n') || path.includes('\r')) return false;
  return true;
}
