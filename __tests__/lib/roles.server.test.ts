import { getUserRolesWithInternalFlag, updateUserExternalRoles } from '@/lib/auth/roles';

type RoleRow = { id: string; name: string; description?: string | null };
type UserRoleRow = { id: string; userId: string; roleId: string };
type Resolver =
  | RoleRow[]
  | UserRoleRow[]
  | { roleName: string }[]
  | { id: string; name: string }[]
  | (() => unknown[]);

type MockDbModule = {
  __pushSelect: (resolver: Resolver) => void;
  __reset: () => void;
  __state: { roles: RoleRow[]; userRoles: UserRoleRow[] };
};

// Access mock helpers from the mocked db module
const { __pushSelect, __reset, __state } = require('@/db') as MockDbModule;

jest.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => ({ type: 'eq', args }),
  inArray: (...args: unknown[]) => ({ type: 'inArray', args }),
  and: (...args: unknown[]) => ({ type: 'and', args }),
}));

jest.mock('@/db/schema', () => {
  const roles = { table: 'roles', id: 'id', name: 'name', description: 'description' };
  const userRoles = { table: 'userRoles', id: 'id', userId: 'userId', roleId: 'roleId' };
  return { roles, userRoles };
});

jest.mock('@/db', () => {
  const state = {
    roles: [] as RoleRow[],
    userRoles: [] as UserRoleRow[],
    selectQueue: [] as ReturnType<typeof buildSelect>[],
  };

  function buildSelect(resolver: Resolver) {
    const where = jest.fn(async () => (typeof resolver === 'function' ? resolver() : resolver));
    const innerJoin = jest.fn(() => ({ where }));
    const from = jest.fn(() => ({ innerJoin, where }));
    return { from, innerJoin, where };
  }

  const __pushSelect = (resolver: Resolver) => {
    state.selectQueue.push(buildSelect(resolver));
  };

  const select = jest.fn(() => {
    const next = state.selectQueue.shift();
    if (!next) throw new Error('Unexpected select call');
    return next;
  });

  const insert = jest.fn((table: { table: string }) => ({
    values: (vals: Partial<RoleRow | UserRoleRow>[]) => {
      if (table.table === 'roles') {
        vals.forEach((v: Partial<RoleRow>) => {
          state.roles.push({
            id: v.id ?? `role-${state.roles.length + 1}`,
            name: v.name ?? '',
            description: v.description ?? null,
          });
        });
      }

      if (table.table === 'userRoles') {
        vals.forEach((v: Partial<UserRoleRow>) => {
          state.userRoles.push({
            id: v.id ?? `userRole-${state.userRoles.length + 1}`,
            userId: v.userId as string,
            roleId: v.roleId as string,
          });
        });
      }

      const chain = {
        onConflictDoNothing: () => chain,
        returning: () => [],
      };

      return chain;
    },
  }));

  const del = jest.fn((table: { table: string }) => ({
    where: (cond: { args?: unknown[] } | undefined) => {
      if (table.table === 'userRoles') {
        const ids =
          (cond?.args?.[1] as { args?: unknown[] } | undefined)?.args?.[1] ?? ([] as string[]);
        state.userRoles = state.userRoles.filter((row) => !(ids as string[]).includes(row.roleId));
      }
      return Promise.resolve();
    },
  }));

  const __reset = () => {
    state.roles = [];
    state.userRoles = [];
    state.selectQueue = [];
    select.mockClear();
    insert.mockClear();
    del.mockClear();
  };

  return {
    db: {
      select,
      insert,
      delete: del,
    },
    __pushSelect,
    __reset,
    __state: state,
  };
});

describe('lib/auth/roles', () => {
  beforeEach(() => {
    __reset();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    (console.warn as jest.Mock).mockRestore();
  });

  it('defaults to volunteer with needsRoleAssignment when no roles exist', async () => {
    __pushSelect([]); // getUserRolesWithInternalFlag

    const result = await getUserRolesWithInternalFlag('user-1');

    expect(result.canonicalRoles).toEqual(['external.volunteer']);
    expect(result.isInternal).toBe(false);
    expect(result.needsRoleAssignment).toBe(true);
    expect(result.permissions.canAccessUserArea).toBe(true);
    expect(result.profileRequirementCategories).toEqual([
      'basicContact',
      'emergencyContact',
      'demographics',
    ]);
  });

  it('classifies admin as internal and skips requirements', async () => {
    __pushSelect([{ roleName: 'admin' }]);

    const result = await getUserRolesWithInternalFlag('user-2');

    expect(result.canonicalRoles).toEqual(['internal.admin']);
    expect(result.isInternal).toBe(true);
    expect(result.needsRoleAssignment).toBe(false);
    expect(result.permissions.canAccessAdminArea).toBe(true);
    expect(result.permissions.canAccessUserArea).toBe(false);
    expect(result.profileRequirementCategories).toEqual([]);
  });

  it('unions permissions and requirements across multiple external roles', async () => {
    __pushSelect([{ roleName: 'organizer' }, { roleName: 'athlete' }]);

    const result = await getUserRolesWithInternalFlag('user-3');

    expect(result.permissions.canManageEvents).toBe(true);
    expect(result.permissions.canViewAthleteDashboard).toBe(true);
    expect(result.permissions.canAccessUserArea).toBe(true);
    expect(result.profileRequirementCategories).toEqual([
      'basicContact',
      'emergencyContact',
      'demographics',
      'physicalAttributes',
    ]);
  });

  it('falls back to volunteer for unknown roles and logs once', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    __pushSelect([{ roleName: 'ghost' }, { roleName: 'mystery' }]);

    const result = await getUserRolesWithInternalFlag('user-4');

    expect(result.canonicalRoles).toEqual(['external.volunteer']);
    expect(result.unmappedRoles.sort()).toEqual(['ghost', 'mystery'].sort());
    expect(result.needsRoleAssignment).toBe(true);
    expect(result.isInternal).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('assigns external role without default when table is empty', async () => {
    __pushSelect([]); // existing roles
    __pushSelect(() =>
      __state.roles
        .filter((role) => role.name === 'organizer')
        .map((role) => ({ id: role.id, name: role.name }))
    ); // desiredRoleRows

    await updateUserExternalRoles('user-5', ['external.organizer']);

    expect(__state.roles.map((r) => r.name)).toContain('organizer');
    const userRoleNames = __state.userRoles.map(
      (ur) => __state.roles.find((r) => r.id === ur.roleId)?.name
    );
    expect(userRoleNames).toEqual(['organizer']);
  });

  it('replaces external roles and preserves internal ones', async () => {
    // existing roles: admin + volunteer
    __state.roles.push(
      { id: 'r-admin', name: 'admin' },
      { id: 'r-vol', name: 'volunteer' },
      { id: 'r-ath', name: 'athlete' }
    );
    __state.userRoles.push(
      { id: 'ur-1', userId: 'user-6', roleId: 'r-admin' },
      { id: 'ur-2', userId: 'user-6', roleId: 'r-vol' }
    );

    __pushSelect([{ roleName: 'admin' }, { roleName: 'volunteer' }]);

    __pushSelect(() =>
      __state.roles
        .filter((role) => role.name === 'athlete' || role.name === 'volunteer')
        .map((role) => ({ id: role.id, name: role.name }))
    );

    await updateUserExternalRoles('user-6', ['external.athlete']);

    const remaining = __state.userRoles.filter((ur) => ur.userId === 'user-6');
    const roleNames = Array.from(
      new Set(remaining.map((ur) => __state.roles.find((r) => r.id === ur.roleId)?.name))
    );

    expect(roleNames.sort()).toEqual(['admin', 'athlete'].sort());
  });
});
