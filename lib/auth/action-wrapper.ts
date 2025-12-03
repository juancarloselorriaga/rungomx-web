import type { ProfileStatus } from '@/lib/profiles/types';
import {
  requireAdminUser,
  requireAuthenticatedUser,
  requireProfileCompleteUser,
  requireStaffUser,
  type AuthenticatedContext,
} from '@/lib/auth/guards';

type GuardFunction<Ctx> = () => Promise<Ctx>;

export type GuardErrorHandlers<Result> = {
  unauthenticated?: () => Result;
  forbidden?: () => Result;
  profileIncomplete?: (profileStatus: ProfileStatus) => Result;
};

/**
 * Core helper that turns a low-level guard (e.g. requireAuthenticatedUser)
 * into a decorator-style wrapper for server actions.
 *
 * - Preserves the original action's argument and result types.
 * - Injects the guard's context as the first argument.
 * - Centralizes mapping of common auth errors into structured results.
 */
export function createAuthorizedAction<Ctx, Result>(
  guard: GuardFunction<Ctx>,
  handlers: GuardErrorHandlers<Result>,
) {
  return function wrap<Args extends unknown[]>(
    action: (ctx: Ctx, ...args: Args) => Promise<Result> | Result,
  ): (...args: Args) => Promise<Result> {
    return async (...args: Args): Promise<Result> => {
      let context: Ctx;

      try {
        context = await guard();
      } catch (error) {
        const err = error as { code?: string; profileStatus?: ProfileStatus };

        if (err.code === 'UNAUTHENTICATED' && handlers.unauthenticated) {
          return handlers.unauthenticated();
        }

        if (err.code === 'FORBIDDEN' && handlers.forbidden) {
          return handlers.forbidden();
        }

        if (err.code === 'PROFILE_INCOMPLETE' && handlers.profileIncomplete) {
          const profileStatus = err.profileStatus;

          if (profileStatus) {
            return handlers.profileIncomplete(profileStatus);
          }
        }

        throw error;
      }

      return action(context, ...args);
    };
  };
}

/**
 * Convenience helpers for the common guard types used across the app.
 * These keep call sites semantic while still allowing each action to
 * decide how auth errors should be represented in its return type.
 */

export function withAuthenticatedUser<Result>(
  handlers: GuardErrorHandlers<Result>,
) {
  return createAuthorizedAction<AuthenticatedContext, Result>(
    requireAuthenticatedUser,
    handlers,
  );
}

export function withProfileCompleteUser<Result>(
  handlers: GuardErrorHandlers<Result>,
) {
  return createAuthorizedAction<AuthenticatedContext, Result>(
    requireProfileCompleteUser,
    handlers,
  );
}

export function withAdminUser<Result>(
  handlers: GuardErrorHandlers<Result>,
) {
  return createAuthorizedAction<AuthenticatedContext, Result>(
    requireAdminUser,
    handlers,
  );
}

export function withStaffUser<Result>(
  handlers: GuardErrorHandlers<Result>,
) {
  return createAuthorizedAction<AuthenticatedContext, Result>(
    requireStaffUser,
    handlers,
  );
}
