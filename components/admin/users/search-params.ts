'use client';

export type AdminUsersSearchParamValue = string | null | undefined;

export type AdminUsersSearchParamUpdates = Record<string, AdminUsersSearchParamValue>;

function buildParams(
  current: string | URLSearchParams | Record<string, string>,
  updates: AdminUsersSearchParamUpdates,
): URLSearchParams {
  const params =
    current instanceof URLSearchParams
      ? new URLSearchParams(current.toString())
      : typeof current === 'string'
        ? new URLSearchParams(current)
        : new URLSearchParams(current);

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  });

  return params;
}

export function buildAdminUsersQueryObject(
  current: string | URLSearchParams | Record<string, string>,
  updates: AdminUsersSearchParamUpdates,
): Record<string, string> {
  const params = buildParams(current, updates);
  return Object.fromEntries(params.entries());
}

export function buildAdminUsersHref(
  basePath: string,
  current: string | URLSearchParams | Record<string, string>,
  updates: AdminUsersSearchParamUpdates,
): string {
  const params = buildParams(current, updates);
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}
