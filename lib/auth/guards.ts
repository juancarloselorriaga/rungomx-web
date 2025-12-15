import type { ProfileStatus } from '@/lib/profiles/types';
import { type AuthContext, getAuthContext } from './server';
import type { Session } from './types';

export class UnauthenticatedError extends Error {
  readonly code = 'UNAUTHENTICATED';

  constructor(message = 'Authentication required') {
    super(message);
  }
}

export type AuthenticatedContext = AuthContext & {
  session: Session;
  user: NonNullable<AuthContext['user']>;
};

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';

  constructor(message = 'Not authorized') {
    super(message);
  }
}

export class ProfileIncompleteError extends Error {
  readonly code = 'PROFILE_INCOMPLETE';
  readonly profileStatus: ProfileStatus;

  constructor(profileStatus: ProfileStatus, message = 'Profile is incomplete') {
    super(message);
    this.profileStatus = profileStatus;
  }
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedContext> {
  const context = await getAuthContext();

  if (!context.user || !context.session) {
    throw new UnauthenticatedError();
  }

  return {
    ...context,
    user: context.user,
    session: context.session,
  };
}

// Guard exported for server actions and API handlers; may be imported later even if unused locally.
export async function requireProfileCompleteUser(): Promise<AuthenticatedContext> {
  const context = await requireAuthenticatedUser();

  if (context.isInternal || !context.permissions.canAccessUserArea) {
    return context;
  }

  if (context.profileStatus.mustCompleteProfile) {
    throw new ProfileIncompleteError(context.profileStatus);
  }

  return context;
}

export async function requireAdminUser(): Promise<AuthenticatedContext> {
  const context = await requireAuthenticatedUser();

  if (!context.permissions.canAccessAdminArea || !context.permissions.canManageUsers) {
    throw new ForbiddenError('Admin access required');
  }

  return context;
}

export async function requireStaffUser(): Promise<AuthenticatedContext> {
  const context = await requireAuthenticatedUser();

  if (!context.permissions.canAccessAdminArea || !context.permissions.canViewStaffTools) {
    throw new ForbiddenError('Staff access required');
  }

  return context;
}
