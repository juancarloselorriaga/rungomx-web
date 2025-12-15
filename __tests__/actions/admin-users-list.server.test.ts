import { listInternalUsers } from '@/app/actions/admin-users-list';
import type { PermissionSet } from '@/lib/auth/roles';

type MockAdminContext = {
  user: { id: string };
};

const mockRequireAdmin = jest.fn<Promise<MockAdminContext>, unknown[]>();
const mockGetUserRolesWithInternalFlag = jest.fn<
  Promise<{ canonicalRoles: string[]; permissions: PermissionSet; isInternal: boolean }>,
  unknown[]
>();

type QuerySnapshot = {
  whereCalls: unknown[][];
  orderByCalls: unknown[][];
  limitValue?: number;
  offsetValue?: number;
};

type MockDbModule = {
  db: { select: jest.Mock };
  __pushSelect: (rows: Array<Record<string, unknown>>) => void;
  __reset: () => void;
  __getQueryHistory: () => QuerySnapshot[];
};

jest.mock('@/lib/auth/guards', () => ({
  requireAdminUser: (...args: unknown[]) => mockRequireAdmin(...args),
}));

jest.mock('@/lib/auth/roles', () => ({
  getUserRolesWithInternalFlag: (...args: unknown[]) => mockGetUserRolesWithInternalFlag(...args),
  getInternalRoleSourceNames: (kind?: 'admin' | 'staff') => {
    if (kind === 'admin') return ['admin'];
    if (kind === 'staff') return ['staff'];
    return ['admin', 'staff'];
  },
}));

jest.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => ({ type: 'eq', args }),
  inArray: (...args: unknown[]) => ({ type: 'inArray', args }),
  and: (...args: unknown[]) => ({ type: 'and', args }),
  or: (...args: unknown[]) => ({ type: 'or', args }),
  ilike: (...args: unknown[]) => ({ type: 'ilike', args }),
  isNull: (...args: unknown[]) => ({ type: 'isNull', args }),
  asc: (value: unknown) => ({ direction: 'asc', value }),
  desc: (value: unknown) => ({ direction: 'desc', value }),
  sql: (...args: unknown[]) => ({ sql: args }),
  SQL: class SQL {},
}));

jest.mock('@/db', () => {
  const state = {
    selectQueue: [] as ReturnType<typeof buildQuery>[],
    queryHistory: [] as ReturnType<typeof buildQuery>[],
  };

  function buildQuery(rows: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing purposes
    const query: any = {};
    const chain = () => query;

    query.whereCalls = [] as unknown[][];
    query.orderByCalls = [] as unknown[][];
    query.limitValue = undefined as number | undefined;
    query.offsetValue = undefined as number | undefined;

    query.from = jest.fn(chain);
    query.innerJoin = jest.fn(chain);
    query.where = jest.fn((...args: unknown[]) => {
      query.whereCalls.push(args);
      return query;
    });
    query.groupBy = jest.fn(chain);
    query.orderBy = jest.fn((...args: unknown[]) => {
      query.orderByCalls.push(args);
      return query;
    });
    query.limit = jest.fn((value: number) => {
      query.limitValue = value;
      return query;
    });
    query.offset = jest.fn((value: number) => {
      query.offsetValue = value;
      return query;
    });
    query.then = (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject);
    query.catch = (reject: (reason: unknown) => void) => Promise.resolve(rows).catch(reject);

    return query;
  }

  const __pushSelect = (rows: unknown[]) => {
    const query = buildQuery(rows);
    state.selectQueue.push(query);
    state.queryHistory.push(query);
  };

  const select = jest.fn(() => {
    const next = state.selectQueue.shift();
    if (!next) throw new Error('Unexpected select call');
    return next;
  });

  const __reset = () => {
    state.selectQueue = [];
    state.queryHistory = [];
    select.mockClear();
  };

  return {
    db: {
      select,
    },
    __pushSelect,
    __reset,
    __getQueryHistory: () =>
      state.queryHistory.map((query) => ({
        whereCalls: query.whereCalls,
        orderByCalls: query.orderByCalls,
        limitValue: query.limitValue,
        offsetValue: query.offsetValue,
      })),
  };
});

const { __pushSelect, __reset, __getQueryHistory, db } = require('@/db') as MockDbModule;

describe('listInternalUsers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockReset();
    mockGetUserRolesWithInternalFlag.mockReset();
    __reset();
  });

  it('returns UNAUTHENTICATED when the admin guard rejects', async () => {
    mockRequireAdmin.mockRejectedValueOnce({ code: 'UNAUTHENTICATED' });

    const result = await listInternalUsers();

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when the admin guard blocks access', async () => {
    mockRequireAdmin.mockRejectedValueOnce({ code: 'FORBIDDEN' });

    const result = await listInternalUsers();

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('lists internal users with canonical roles and permissions', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    const adminCreatedAt = new Date('2024-02-01T12:00:00Z');
    const staffCreatedAt = new Date('2024-01-15T09:30:00Z');

    __pushSelect([
      {
        userId: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        createdAt: adminCreatedAt,
      },
      {
        userId: 'user-2',
        email: 'staff@example.com',
        name: 'Staff User',
        createdAt: staffCreatedAt,
      },
    ]);

    __pushSelect([{ value: 2 }]);

    const adminPermissions: PermissionSet = {
      canAccessAdminArea: true,
      canAccessUserArea: false,
      canManageUsers: true,
      canManageEvents: true,
      canViewStaffTools: true,
      canViewOrganizersDashboard: false,
      canViewAthleteDashboard: false,
    };
    const staffPermissions: PermissionSet = {
      ...adminPermissions,
      canManageUsers: false,
    };

    mockGetUserRolesWithInternalFlag.mockResolvedValueOnce({
      canonicalRoles: ['internal.admin'],
      permissions: adminPermissions,
      isInternal: true,
    });

    mockGetUserRolesWithInternalFlag.mockResolvedValueOnce({
      canonicalRoles: ['internal.staff'],
      permissions: staffPermissions,
      isInternal: true,
    });

    const result = await listInternalUsers();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.users).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.total).toBe(2);
      expect(result.pageCount).toBe(1);
      expect(result.users[0]).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          email: 'admin@example.com',
          canonicalRoles: ['internal.admin'],
          permissions: adminPermissions,
          createdAt: adminCreatedAt,
          isInternal: true,
        }),
      );
      expect(result.users[1]).toEqual(
        expect.objectContaining({
          userId: 'user-2',
          canonicalRoles: ['internal.staff'],
          permissions: staffPermissions,
          createdAt: staffCreatedAt,
          isInternal: true,
        }),
      );
    }

    expect(mockGetUserRolesWithInternalFlag).toHaveBeenCalledTimes(2);
  });

  it('filters out users that are not internal after role resolution', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    const createdAt = new Date('2024-03-10T10:00:00Z');

    __pushSelect([
      {
        userId: 'user-1',
        email: 'maybe-internal@example.com',
        name: 'Maybe Internal',
        createdAt,
      },
      {
        userId: 'user-2',
        email: 'not-internal@example.com',
        name: 'Not Internal',
        createdAt,
      },
    ]);

    __pushSelect([{ value: 2 }]);

    const internalPermissions: PermissionSet = {
      canAccessAdminArea: true,
      canAccessUserArea: false,
      canManageUsers: true,
      canManageEvents: true,
      canViewStaffTools: true,
      canViewOrganizersDashboard: false,
      canViewAthleteDashboard: false,
    };

    mockGetUserRolesWithInternalFlag.mockResolvedValueOnce({
      canonicalRoles: ['internal.admin'],
      permissions: internalPermissions,
      isInternal: true,
    });
    mockGetUserRolesWithInternalFlag.mockResolvedValueOnce({
      canonicalRoles: ['external.organizer'],
      permissions: {
        canAccessAdminArea: false,
        canAccessUserArea: true,
        canManageUsers: false,
        canManageEvents: true,
        canViewStaffTools: false,
        canViewOrganizersDashboard: true,
        canViewAthleteDashboard: false,
      },
      isInternal: false,
    });

    const result = await listInternalUsers();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.users).toHaveLength(1);
      expect(result.users[0].userId).toBe('user-1');
    }
  });

  it('applies role and search filters to the query', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    const createdAt = new Date('2024-05-01T10:00:00Z');

    __pushSelect([
      {
        userId: 'user-1',
        email: 'john@example.com',
        name: 'John Admin',
        createdAt,
      },
    ]);

    __pushSelect([{ value: 1 }]);

    mockGetUserRolesWithInternalFlag.mockResolvedValueOnce({
      canonicalRoles: ['internal.admin'],
      permissions: {
        canAccessAdminArea: true,
        canAccessUserArea: false,
        canManageUsers: true,
        canManageEvents: true,
        canViewStaffTools: true,
        canViewOrganizersDashboard: false,
        canViewAthleteDashboard: false,
      },
      isInternal: true,
    });

    await listInternalUsers({ role: 'admin', search: 'john' });

    const history = __getQueryHistory();
    const whereArg = history[0]?.whereCalls?.[0]?.[0] as
      | { type?: string; args?: unknown[] }
      | undefined;
    expect(whereArg?.type).toBe('and');
    const filters = whereArg?.args ?? [];
    const roleFilter = filters.find(
      (filter) => (filter as { type?: string })?.type === 'inArray',
    ) as { args?: unknown[] } | undefined;
    expect(roleFilter?.args?.[1]).toEqual(expect.arrayContaining(['admin']));
    expect(filters).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'or' })]));
  });

  it('applies sort and pagination parameters', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    __pushSelect([
      {
        userId: 'user-1',
        email: 'a@example.com',
        name: 'Alpha',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
    ]);
    __pushSelect([{ value: 1 }]);

    mockGetUserRolesWithInternalFlag.mockResolvedValueOnce({
      canonicalRoles: ['internal.admin'],
      permissions: {
        canAccessAdminArea: true,
        canAccessUserArea: false,
        canManageUsers: true,
        canManageEvents: true,
        canViewStaffTools: true,
        canViewOrganizersDashboard: false,
        canViewAthleteDashboard: false,
      },
      isInternal: true,
    });

    await listInternalUsers({ sortBy: 'name', sortDir: 'asc', page: 2, pageSize: 5 });

    const history = __getQueryHistory();
    const orderByArg = history[0]?.orderByCalls?.[0]?.[0] as { direction?: string } | undefined;
    expect(orderByArg?.direction).toBe('asc');
    expect(history[0]?.limitValue).toBe(5);
    expect(history[0]?.offsetValue).toBe(5);
  });

  it('returns SERVER_ERROR when the query fails', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    db.select.mockImplementationOnce(() => {
      throw new Error('db failure');
    });

    const result = await listInternalUsers();

    expect(result).toEqual({ ok: false, error: 'SERVER_ERROR' });
  });
});
