import { deleteUser } from '@/lib/users/delete-user';

type Call =
  | { op: 'delete'; table: unknown; condition: unknown }
  | { op: 'update'; table: unknown; values: unknown; condition: unknown };

type MockDbModule = {
  db: { transaction: jest.Mock };
  __pushSelect: (rows: Array<Record<string, unknown>>) => void;
  __getCalls: () => Call[];
  __reset: () => void;
};

jest.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => ({ type: 'eq', args }),
  and: (...args: unknown[]) => ({ type: 'and', args }),
  isNull: (...args: unknown[]) => ({ type: 'isNull', args }),
}));

jest.mock('@/db', () => {
  const state = {
    selectQueue: [] as unknown[][],
    calls: [] as Call[],
  };

  const __pushSelect = (rows: unknown[]) => state.selectQueue.push(rows);

  const __getCalls = () => state.calls;

  const __reset = () => {
    state.selectQueue = [];
    state.calls = [];
  };

  const buildSelect = (rows: unknown[]) => ({
    from: jest.fn(() => ({
      where: jest.fn(async () => rows),
    })),
  });

  const tx = {
    select: jest.fn(() => {
      const rows = state.selectQueue.shift();
      if (!rows) throw new Error('Unexpected select call');
      return buildSelect(rows);
    }),
    delete: jest.fn((table: unknown) => ({
      where: jest.fn(async (condition: unknown) => {
        state.calls.push({ op: 'delete', table, condition });
        return undefined;
      }),
    })),
    update: jest.fn((table: unknown) => ({
      set: jest.fn((values: unknown) => ({
        where: jest.fn(async (condition: unknown) => {
          state.calls.push({ op: 'update', table, values, condition });
          return undefined;
        }),
      })),
    })),
  };

  const transaction = jest.fn(async <T>(callback: (trx: typeof tx) => Promise<T>): Promise<T> => {
    return callback(tx);
  });

  return { db: { transaction }, __pushSelect, __getCalls, __reset };
});

const { __pushSelect, __getCalls, __reset } = require('@/db') as MockDbModule;

describe('deleteUser', () => {
  beforeEach(() => {
    __reset();
  });

  it('returns NOT_FOUND when the user does not exist or is already deleted', async () => {
    __pushSelect([]);

    const result = await deleteUser({ targetUserId: 'user-404', deletedByUserId: 'admin-1' });

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(__getCalls()).toHaveLength(0);
  });

  it('revokes sessions/accounts and anonymizes user data', async () => {
    // First select: user data
    __pushSelect([{ email: 'person@example.com', name: 'Person Name' }]);
    // Second select: profile locale
    __pushSelect([{ locale: 'en' }]);

    const result = await deleteUser({ targetUserId: 'user-1', deletedByUserId: 'admin-1' });

    expect(result).toEqual({
      ok: true,
      deletedUser: { email: 'person@example.com', name: 'Person Name', locale: 'en' },
    });

    const calls = __getCalls();

    const deletes = calls.filter((c) => c.op === 'delete') as Array<Extract<Call, { op: 'delete' }>>;
    const updates = calls.filter((c) => c.op === 'update') as Array<Extract<Call, { op: 'update' }>>;

    expect(deletes).toHaveLength(3);
    expect(updates).toHaveLength(4);

    const userUpdate = updates.find(
      (u) =>
        typeof u.values === 'object' &&
        u.values !== null &&
        (u.values as { deletedByUserId?: unknown }).deletedByUserId === 'admin-1',
    );
    expect(userUpdate?.values).toEqual(
      expect.objectContaining({
        deletedByUserId: 'admin-1',
        email: 'deleted+user-1@example.invalid',
        name: 'Deleted user',
        image: null,
        emailVerified: false,
      }),
    );

    const contactUpdate = updates.find(
      (u) =>
        typeof u.values === 'object' && u.values !== null && (u.values as { message?: unknown }).message === '[redacted]',
    );
    expect(contactUpdate?.values).toEqual(
      expect.objectContaining({
        userId: null,
        name: null,
        email: null,
        message: '[redacted]',
        metadata: {},
      }),
    );

    const profileUpdate = updates.find(
      (u) => typeof u.values === 'object' && u.values !== null && (u.values as { country?: unknown }).country === 'MX',
    );
    expect(profileUpdate?.values).toEqual(
      expect.objectContaining({ deletedAt: expect.any(Date), country: 'MX', medicalConditions: null }),
    );
  });
});
