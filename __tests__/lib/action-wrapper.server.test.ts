jest.mock('@/lib/auth/guards', () => {
  class MockForbiddenError extends Error {
    code = 'FORBIDDEN';
  }

  class MockUnauthenticatedError extends Error {
    code = 'UNAUTHENTICATED';
  }

  class MockProfileIncompleteError extends Error {
    code = 'PROFILE_INCOMPLETE';
    profileStatus: unknown;

    constructor(profileStatus: unknown) {
      super('Profile is incomplete');
      this.profileStatus = profileStatus;
    }
  }

  return {
    ForbiddenError: MockForbiddenError,
    UnauthenticatedError: MockUnauthenticatedError,
    ProfileIncompleteError: MockProfileIncompleteError,
    requireAuthenticatedUser: jest.fn(),
    requireAdminUser: jest.fn(),
    requireProfileCompleteUser: jest.fn(),
    requireStaffUser: jest.fn(),
  };
});

import { createAuthorizedAction, type GuardErrorHandlers } from '@/lib/auth/action-wrapper';

type TestContext = { userId: string };

type TestResult =
  | { ok: true; value: string }
  | { ok: false; error: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'PROFILE_INCOMPLETE' }
  | { ok: false; error: 'OTHER' };

describe('createAuthorizedAction', () => {
  const handlers: GuardErrorHandlers<TestResult> = {
    unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
    forbidden: () => ({ ok: false, error: 'FORBIDDEN' }),
    profileIncomplete: () => ({ ok: false, error: 'PROFILE_INCOMPLETE' }),
  };

  it('passes context to the wrapped action on success', async () => {
    const guard = jest.fn<Promise<TestContext>, []>(async () => ({ userId: 'user-1' }));

    const wrapped = createAuthorizedAction<TestContext, TestResult>(
      guard,
      handlers,
    )(async (ctx, input: string) => ({
      ok: true,
      value: `${ctx.userId}:${input}`,
    }));

    const result = await wrapped('payload');

    expect(guard).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, value: 'user-1:payload' });
  });

  it('maps unauthenticated guard failures to the unauthenticated handler', async () => {
    const guard = jest.fn<Promise<TestContext>, []>(async () => {
      throw { code: 'UNAUTHENTICATED' } as { code: string };
    });

    const wrapped = createAuthorizedAction<TestContext, TestResult>(
      guard,
      handlers,
    )(async () => ({ ok: true, value: 'should-not-run' }));

    const result = await wrapped();
    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('maps forbidden guard failures to the forbidden handler', async () => {
    const guard = jest.fn<Promise<TestContext>, []>(async () => {
      throw { code: 'FORBIDDEN' } as { code: string };
    });

    const wrapped = createAuthorizedAction<TestContext, TestResult>(
      guard,
      handlers,
    )(async () => ({ ok: true, value: 'should-not-run' }));

    const result = await wrapped();
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('maps profile incomplete failures to the profileIncomplete handler', async () => {
    const guard = jest.fn<Promise<TestContext>, []>(async () => {
      throw {
        code: 'PROFILE_INCOMPLETE',
        profileStatus: {
          hasProfile: false,
          isComplete: false,
          mustCompleteProfile: true,
        },
      } as { code: string; profileStatus: unknown };
    });

    const wrapped = createAuthorizedAction<TestContext, TestResult>(
      guard,
      handlers,
    )(async () => ({ ok: true, value: 'should-not-run' }));

    const result = await wrapped();
    expect(result).toEqual({ ok: false, error: 'PROFILE_INCOMPLETE' });
  });

  it('rethrows unexpected errors when no handler matches', async () => {
    const guard = jest.fn<Promise<TestContext>, []>(async () => {
      throw new Error('boom');
    });

    const wrapped = createAuthorizedAction<TestContext, TestResult>(
      guard,
      handlers,
    )(async () => ({ ok: true, value: 'should-not-run' }));

    await expect(wrapped()).rejects.toThrow('boom');
  });
});
