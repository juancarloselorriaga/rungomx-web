type RoutingPathnames = Record<string, string | Record<string, string | undefined>>;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildPathMatcher = (localizedPath: string) => {
  if (localizedPath === '/') {
    return { matcher: /^\/$/, paramNames: [] as string[] };
  }

  const segments = localizedPath.split('/').filter(Boolean);
  const paramNames: string[] = [];
  const pattern = segments
    .map((segment) => {
      if (segment.startsWith('[') && segment.endsWith(']')) {
        paramNames.push(segment.slice(1, -1));
        return '([^/]+)';
      }
      return escapeRegex(segment);
    })
    .join('/');

  // Capture any remaining path so broad entries like `/dashboard` can still
  // map `/tablero/...` to `/dashboard/...` when a more specific entry isn't declared.
  return {
    matcher: new RegExp(`^/${pattern}((?:/.*)?)$`),
    paramNames,
  };
};

const getSpecificity = (localizedPath: string) => {
  const segments = localizedPath.split('/').filter(Boolean);
  const dynamicSegments = segments.filter(
    (segment) => segment.startsWith('[') && segment.endsWith(']'),
  ).length;
  const staticSegments = segments.length - dynamicSegments;
  return {
    depth: segments.length,
    staticSegments,
    length: localizedPath.length,
  };
};

/**
 * Convert a localized pathname (e.g. `/tablero/eventos/nuevo`) into its internal
 * pathname (e.g. `/dashboard/events/new`) using the provided routing pathnames map.
 *
 * This is isolated for Jest tests because `i18n/routing` depends on ESM-only
 * dependencies that the Jest Node project does not currently transform.
 */
export const toInternalPathFromPathnames = (
  pathname: string,
  locale: string,
  pathnames: RoutingPathnames | undefined,
) => {
  if (pathname === '/') return '/';

  const entries = Object.entries(pathnames ?? {})
    .map(([internal, localized]) => {
      const localizedPath = typeof localized === 'string' ? localized : localized[locale];
      return localizedPath ? ({ internal, localizedPath } as const) : null;
    })
    .filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    )
    .sort((a, b) => {
      const aSpec = getSpecificity(a.localizedPath);
      const bSpec = getSpecificity(b.localizedPath);

      // Deeper paths first (more segments).
      if (aSpec.depth !== bSpec.depth) return bSpec.depth - aSpec.depth;

      // Prefer more static segments. This ensures `/.../nuevo` wins over `/.../[eventId]`.
      if (aSpec.staticSegments !== bSpec.staticSegments) {
        return bSpec.staticSegments - aSpec.staticSegments;
      }

      // Tie-breaker: longer strings first.
      return bSpec.length - aSpec.length;
    });

  for (const entry of entries) {
    const { matcher, paramNames } = buildPathMatcher(entry.localizedPath);
    const match = matcher.exec(pathname);
    if (match) {
      let resolved = entry.internal;
      for (const [index, name] of paramNames.entries()) {
        resolved = resolved.replace(`[${name}]`, match[index + 1]);
      }

      const rest = match[paramNames.length + 1] ?? '';
      return `${resolved}${rest}` || '/';
    }
  }

  return pathname;
};

