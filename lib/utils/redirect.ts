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

export function isSafeRedirectPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.includes('\\')) return false;
  if (path.includes('\n') || path.includes('\r')) return false;
  return true;
}

