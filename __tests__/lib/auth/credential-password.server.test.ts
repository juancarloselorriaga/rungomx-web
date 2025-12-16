/**
 * Server tests for verifyUserCredentialPassword
 *
 * Tests password verification logic with mocked database and crypto.
 */
const mockVerifyPassword = jest.fn<Promise<boolean>, [{ hash: string; password: string }]>();

jest.mock('better-auth/crypto', () => ({
  verifyPassword: (args: { hash: string; password: string }) => mockVerifyPassword(args),
}));

type AccountRow = {
  passwordHash: string | null;
};

type MockDbState = {
  selectQueue: AccountRow[][];
};

jest.mock('@/db', () => {
  const state: MockDbState = {
    selectQueue: [],
  };

  const __pushSelect = (rows: AccountRow[]) => state.selectQueue.push(rows);

  const __reset = () => {
    state.selectQueue = [];
  };

  const buildSelect = (rows: AccountRow[]) => ({
    from: jest.fn(() => ({
      where: jest.fn(async () => rows),
    })),
  });

  const db = {
    select: jest.fn(() => {
      const rows = state.selectQueue.shift();
      if (!rows) throw new Error('Unexpected select call');
      return buildSelect(rows);
    }),
  };

  return { db, __pushSelect, __reset };
});

jest.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => ({ type: 'eq', args }),
  and: (...args: unknown[]) => ({ type: 'and', args }),
  isNull: (...args: unknown[]) => ({ type: 'isNull', args }),
}));

type MockDbModule = {
  db: { select: jest.Mock };
  __pushSelect: (rows: AccountRow[]) => void;
  __reset: () => void;
};

const { __pushSelect, __reset } = require('@/db') as MockDbModule;

import { verifyUserCredentialPassword } from '@/lib/auth/credential-password';

describe('verifyUserCredentialPassword', () => {
  beforeEach(() => {
    __reset();
    mockVerifyPassword.mockReset();
  });

  it('returns ok: true for correct password', async () => {
    __pushSelect([{ passwordHash: '$argon2id$hashed-password' }]);
    mockVerifyPassword.mockResolvedValueOnce(true);

    const result = await verifyUserCredentialPassword('user-1', 'correctPassword');

    expect(result).toEqual({ ok: true });
    expect(mockVerifyPassword).toHaveBeenCalledWith({
      hash: '$argon2id$hashed-password',
      password: 'correctPassword',
    });
  });

  it('returns INVALID_PASSWORD for wrong password', async () => {
    __pushSelect([{ passwordHash: '$argon2id$hashed-password' }]);
    mockVerifyPassword.mockResolvedValueOnce(false);

    const result = await verifyUserCredentialPassword('user-1', 'wrongPassword');

    expect(result).toEqual({ ok: false, error: 'INVALID_PASSWORD' });
  });

  it('returns NO_PASSWORD when no credential account exists', async () => {
    __pushSelect([]);

    const result = await verifyUserCredentialPassword('user-1', 'anyPassword');

    expect(result).toEqual({ ok: false, error: 'NO_PASSWORD' });
    expect(mockVerifyPassword).not.toHaveBeenCalled();
  });

  it('returns NO_PASSWORD when password hash is null', async () => {
    __pushSelect([{ passwordHash: null }]);

    const result = await verifyUserCredentialPassword('user-1', 'anyPassword');

    expect(result).toEqual({ ok: false, error: 'NO_PASSWORD' });
    expect(mockVerifyPassword).not.toHaveBeenCalled();
  });

  it('returns NO_PASSWORD when password hash is empty string', async () => {
    // Empty string should be treated as truthy but verifyPassword would fail
    // Actually in the code, only `null` is checked, but let's verify behavior
    __pushSelect([{ passwordHash: '' }]);
    // Empty string is falsy in JS, so it should return NO_PASSWORD
    // Actually '' is falsy, so passwordHash check will fail

    const result = await verifyUserCredentialPassword('user-1', 'anyPassword');

    expect(result).toEqual({ ok: false, error: 'NO_PASSWORD' });
  });
});
