import { deleteInternalUser } from '@/app/actions/admin-users-delete';

type MockAdminContext = {
  user: { id: string };
};

const mockRequireAdmin = jest.fn<Promise<MockAdminContext>, unknown[]>();

type UpdateCall = { table: unknown; values: unknown; condition: unknown };

type MockDbModule = {
  db: { select: jest.Mock; transaction: jest.Mock };
  __pushSelect: (rows: Array<Record<string, unknown>>) => void;
  __reset: () => void;
  __getUpdateCalls: () => UpdateCall[];
};

jest.mock('@/lib/auth/guards', () => ({
  requireAdminUser: (...args: unknown[]) => mockRequireAdmin(...args),
}));

jest.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => ({ type: 'eq', args }),
  and: (...args: unknown[]) => ({ type: 'and', args }),
  isNull: (...args: unknown[]) => ({ type: 'isNull', args }),
}));

jest.mock('@/db', () => {
  const state = {
    selectQueue: [] as ReturnType<typeof buildSelect>[],
    updateCalls: [] as UpdateCall[],
  };

  function buildSelect(rows: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing purposes
    const query: any = {};
    const chain = () => query;

    query.from = jest.fn(chain);
    query.where = jest.fn(chain);
    query.then = (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject);
    query.catch = (reject: (reason: unknown) => void) => Promise.resolve(rows).catch(reject);

    return query;
  }

  const __pushSelect = (rows: unknown[]) => {
    state.selectQueue.push(buildSelect(rows));
  };

  const select = jest.fn(() => {
    const next = state.selectQueue.shift();
    if (!next) throw new Error('Unexpected select call');
    return next;
  });

  const update = jest.fn((table: unknown) => {
    const where = jest.fn(async (condition: unknown) => {
      state.updateCalls.push({ table, values: undefined, condition });
      return undefined;
    });

    const set = jest.fn((values: unknown) => ({
      where: jest.fn(async (condition: unknown) => {
        state.updateCalls.push({ table, values, condition });
        return undefined;
      }),
    }));

    return { set, where };
  });

  const transaction = jest.fn(
    async (callback: (tx: { update: typeof update }) => Promise<void>) => {
      await callback({ update });
    },
  );

  const __reset = () => {
    state.selectQueue = [];
    state.updateCalls = [];
    select.mockClear();
    transaction.mockClear();
    update.mockClear();
  };

  return {
    db: {
      select,
      transaction,
    },
    __pushSelect,
    __reset,
    __getUpdateCalls: () => state.updateCalls,
  };
});

const { __pushSelect, __reset, __getUpdateCalls, db } = require('@/db') as MockDbModule;

describe('deleteInternalUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockReset();
    __reset();
  });

  it('returns UNAUTHENTICATED when the admin guard rejects', async () => {
    mockRequireAdmin.mockRejectedValueOnce({ code: 'UNAUTHENTICATED' });

    const result = await deleteInternalUser({ userId: '00000000-0000-0000-0000-000000000001' });

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when the admin guard blocks access', async () => {
    mockRequireAdmin.mockRejectedValueOnce({ code: 'FORBIDDEN' });

    const result = await deleteInternalUser({ userId: '00000000-0000-0000-0000-000000000001' });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('prevents deleting the current user', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: '00000000-0000-0000-0000-000000000001' } });

    const result = await deleteInternalUser({ userId: '00000000-0000-0000-0000-000000000001' });

    expect(result).toEqual({ ok: false, error: 'CANNOT_DELETE_SELF' });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the target user does not exist', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    __pushSelect([]);

    const result = await deleteInternalUser({ userId: '00000000-0000-0000-0000-000000000099' });

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(db.select).toHaveBeenCalled();
    expect(__getUpdateCalls()).toHaveLength(0);
  });

  it('soft deletes users, accounts, and sessions', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    __pushSelect([{ id: '00000000-0000-0000-0000-000000000002' }]);

    const result = await deleteInternalUser({ userId: '00000000-0000-0000-0000-000000000002' });

    expect(result).toEqual({ ok: true });
    expect(db.select).toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalled();
    const updateCalls = __getUpdateCalls();
    expect(updateCalls).toHaveLength(3);
    updateCalls.forEach((call) => {
      expect(call.values).toEqual(expect.objectContaining({ deletedAt: expect.any(Date) }));
    });
  });

  it('returns SERVER_ERROR when the delete flow throws', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-1' } });
    db.select.mockImplementationOnce(() => {
      throw new Error('db failure');
    });

    const result = await deleteInternalUser({ userId: '00000000-0000-0000-0000-000000000003' });

    expect(result).toEqual({ ok: false, error: 'SERVER_ERROR' });
  });
});
