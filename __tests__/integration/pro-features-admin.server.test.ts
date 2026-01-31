jest.mock('@/lib/auth/guards', () => ({
  requireStaffUser: jest.fn(),
}));

jest.mock('@/db', () => ({
  db: {
    query: {
      proFeatureConfigs: {
        findFirst: jest.fn(),
      },
    },
    transaction: jest.fn(),
  },
}));

jest.mock('@/lib/audit', () => ({
  createAuditLog: jest.fn(),
  getRequestContext: jest.fn(async () => ({})),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
}));

import { updateProFeatureConfigAdminAction } from '@/app/actions/pro-features-admin';
import type { AuthenticatedContext } from '@/lib/auth/guards';
import { requireStaffUser } from '@/lib/auth/guards';
import { db } from '@/db';
import { createAuditLog } from '@/lib/audit';

const mockRequireStaffUser = requireStaffUser as jest.MockedFunction<typeof requireStaffUser>;
const mockCreateAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>;
const mockDb = db as unknown as {
  query: {
    proFeatureConfigs: {
      findFirst: jest.Mock;
    };
  };
  transaction: jest.Mock;
};

describe('Pro features admin actions', () => {
  const authContext = {
    user: { id: 'user-1' },
    isInternal: false,
    permissions: {
      canAccessAdminArea: true,
      canAccessUserArea: false,
      canManageUsers: false,
      canManageEvents: false,
      canViewStaffTools: true,
      canViewOrganizersDashboard: false,
      canViewAthleteDashboard: false,
    },
  } as AuthenticatedContext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireStaffUser.mockResolvedValue(authContext);
  });

  it('rejects unknown feature keys', async () => {
    const result = await updateProFeatureConfigAdminAction({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test invalid key
      featureKey: 'unknown' as any,
      patch: { enabled: false },
      reason: 'Required reason',
    });

    expect(result.ok).toBe(false);
    expect(result).toEqual(expect.objectContaining({ error: 'INVALID_INPUT' }));
  });

  it('requires a reason for updates', async () => {
    const result = await updateProFeatureConfigAdminAction({
      featureKey: 'event_clone',
      patch: { enabled: false },
      reason: '',
    });

    expect(result.ok).toBe(false);
    expect(result).toEqual(expect.objectContaining({ error: 'INVALID_INPUT' }));
  });

  it('fails the mutation when audit logging fails', async () => {
    const mockTx = {
      query: {
        proFeatureConfigs: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'config-1',
            featureKey: 'event_clone',
            enabled: true,
            visibilityOverride: null,
            notes: null,
          }),
        },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              {
                id: 'config-1',
                featureKey: 'event_clone',
                enabled: false,
                visibilityOverride: null,
                notes: null,
              },
            ]),
          }),
        }),
      }),
    };

    mockDb.transaction.mockImplementation(async (handler: (tx: typeof mockTx) => Promise<unknown>) =>
      handler(mockTx),
    );
    mockCreateAuditLog.mockResolvedValue({ ok: false, error: 'audit failed' });

    const result = await updateProFeatureConfigAdminAction({
      featureKey: 'event_clone',
      patch: { enabled: false },
      reason: 'Testing audit failure',
    });

    expect(mockCreateAuditLog).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result).toEqual(expect.objectContaining({ error: 'SERVER_ERROR' }));
  });

  it('writes an audit log on successful update', async () => {
    const mockTx = {
      query: {
        proFeatureConfigs: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'config-1',
            featureKey: 'event_clone',
            enabled: true,
            visibilityOverride: null,
            notes: null,
          }),
        },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              {
                id: 'config-1',
                featureKey: 'event_clone',
                enabled: false,
                visibilityOverride: 'locked',
                notes: 'Updated',
              },
            ]),
          }),
        }),
      }),
    };

    mockDb.transaction.mockImplementation(async (handler: (tx: typeof mockTx) => Promise<unknown>) =>
      handler(mockTx),
    );
    mockCreateAuditLog.mockResolvedValue({ ok: true, auditLogId: 'audit-1' });

    const result = await updateProFeatureConfigAdminAction({
      featureKey: 'event_clone',
      patch: { enabled: false, visibilityOverride: 'locked', notes: 'Updated' },
      reason: 'Admin change',
    });

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: null,
        actorUserId: authContext.user.id,
        action: 'pro_feature_config.update',
        entityType: 'pro_feature_config',
        entityId: 'config-1',
        after: expect.objectContaining({ reason: 'Admin change' }),
      }),
      mockTx,
    );
    expect(result.ok).toBe(true);
  });
});
