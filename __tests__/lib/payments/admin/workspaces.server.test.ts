import {
  adminPaymentsRangeSelectorWorkspaceIds,
  adminPaymentsWorkspaceIds,
  normalizeAdminPaymentsWorkspace,
} from '@/lib/payments/admin/workspaces';

describe('admin payments workspaces', () => {
  it('uses the expected visible workspace order', () => {
    expect(adminPaymentsWorkspaceIds).toEqual([
      'volume',
      'economics',
      'risk',
      'operations',
      'investigation',
    ]);
  });

  it('normalizes overview and invalid values to economics', () => {
    expect(normalizeAdminPaymentsWorkspace('overview')).toBe('economics');
    expect(normalizeAdminPaymentsWorkspace('economics')).toBe('economics');
    expect(normalizeAdminPaymentsWorkspace(undefined)).toBe('economics');
    expect(normalizeAdminPaymentsWorkspace('unknown')).toBe('economics');
    expect(normalizeAdminPaymentsWorkspace('volume')).toBe('volume');
  });

  it('keeps the range selector on volume, economics, and risk', () => {
    expect(adminPaymentsRangeSelectorWorkspaceIds).toEqual(['volume', 'economics', 'risk']);
  });
});
