export const adminPaymentsWorkspaceIds = [
  'volume',
  'economics',
  'risk',
  'operations',
  'investigation',
] as const;

export type AdminPaymentsWorkspaceId = (typeof adminPaymentsWorkspaceIds)[number];

export const adminPaymentsRangeSelectorWorkspaceIds = ['volume', 'economics', 'risk'] as const satisfies ReadonlyArray<AdminPaymentsWorkspaceId>;

const adminPaymentsWorkspaceScopedSearchParams = {
  volume: ['range', 'organizerPage'],
  economics: ['range'],
  risk: ['range'],
  operations: ['range'],
  investigation: ['range', 'caseQuery', 'lookupQuery', 'evidenceTraceId', 'investigationTool'],
} as const satisfies Record<AdminPaymentsWorkspaceId, readonly string[]>;

export function normalizeAdminPaymentsWorkspace(
  rawWorkspace: string | undefined,
): AdminPaymentsWorkspaceId {
  if (rawWorkspace === 'overview' || rawWorkspace === 'economics') {
    return 'economics';
  }

  if (
    rawWorkspace === 'volume' ||
    rawWorkspace === 'risk' ||
    rawWorkspace === 'operations' ||
    rawWorkspace === 'investigation'
  ) {
    return rawWorkspace;
  }

  return 'economics';
}

export function buildAdminPaymentsWorkspaceSearchParams(
  searchParams: URLSearchParams | string | null | undefined,
  nextWorkspace: AdminPaymentsWorkspaceId,
): URLSearchParams {
  const current =
    typeof searchParams === 'string'
      ? new URLSearchParams(searchParams)
      : new URLSearchParams(searchParams?.toString());
  const next = new URLSearchParams();
  const allowedKeys: ReadonlySet<string> = new Set(
    adminPaymentsWorkspaceScopedSearchParams[nextWorkspace],
  );

  for (const [key, value] of current.entries()) {
    if (allowedKeys.has(key)) {
      next.append(key, value);
    }
  }

  next.set('workspace', nextWorkspace);
  return next;
}
