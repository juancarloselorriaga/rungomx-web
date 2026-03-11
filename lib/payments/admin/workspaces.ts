export const adminPaymentsWorkspaceIds = [
  'volume',
  'economics',
  'risk',
  'operations',
  'investigation',
] as const;

export type AdminPaymentsWorkspaceId = (typeof adminPaymentsWorkspaceIds)[number];

export const adminPaymentsRangeSelectorWorkspaceIds = ['volume', 'economics', 'risk'] as const satisfies ReadonlyArray<AdminPaymentsWorkspaceId>;

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
