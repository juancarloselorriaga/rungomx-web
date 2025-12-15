'use server';

import { auth } from '@/lib/auth';
import { withAdminUser } from '@/lib/auth/action-wrapper';
import { type CanonicalRole, type PermissionSet, updateUserInternalRoles } from '@/lib/auth/roles';
import { resolveUserContext } from '@/lib/auth/user-context';
import { ProfileMetadata } from '@/lib/profiles/metadata';
import { ProfileRequirementSummary } from '@/lib/profiles/requirements';
import { ProfileStatus } from '@/lib/profiles/types';
import { z } from 'zod';

const internalUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8).max(128),
});

type CreateInternalUserInput = z.infer<typeof internalUserSchema>;

type CreateInternalUserError =
  | { ok: false; error: 'UNAUTHENTICATED' }
  | { ok: false; error: 'FORBIDDEN' }
  | { ok: false; error: 'INVALID_INPUT'; details?: ReturnType<typeof z.treeifyError> }
  | { ok: false; error: 'SERVER_ERROR' };

type CreateInternalUserSuccess = {
  ok: true;
  userId: string;
  email: string;
  name: string;
  canonicalRoles: CanonicalRole[];
  permissions: PermissionSet;
  profileStatus: ProfileStatus;
  profileRequirements: ProfileRequirementSummary;
  profileMetadata: ProfileMetadata;
};

type CreateInternalUserResult = CreateInternalUserSuccess | CreateInternalUserError;

async function createInternalUser(
  targetRole: CanonicalRole,
  input: unknown,
): Promise<CreateInternalUserResult> {
  const parsed = internalUserSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: 'INVALID_INPUT', details: z.treeifyError(parsed.error) };
  }

  const { email, name, password } = parsed.data;

  try {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        name,
        password,
      } satisfies CreateInternalUserInput,
    });

    const user = (signUpResult as { user?: { id: string; email: string; name?: string } }).user;

    if (!user) {
      console.error('[admin-users] signUpEmail did not return a user');
      return { ok: false, error: 'SERVER_ERROR' };
    }

    await updateUserInternalRoles(user.id, [targetRole]);

    const resolved = await resolveUserContext(user);

    return {
      ok: true,
      userId: user.id,
      email: user.email,
      name: user.name ?? '',
      canonicalRoles: resolved.canonicalRoles,
      permissions: resolved.permissions,
      profileStatus: resolved.profileStatus,
      profileRequirements: resolved.profileRequirements,
      profileMetadata: resolved.profileMetadata,
    };
  } catch (error) {
    console.error('[admin-users] Failed to create internal user', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
}

export const createAdminUser = withAdminUser<CreateInternalUserResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN' }),
})(async (_adminContext, input: unknown) => {
  return createInternalUser('internal.admin', input);
});

export const createStaffUser = withAdminUser<CreateInternalUserResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN' }),
})(async (_adminContext, input: unknown) => {
  return createInternalUser('internal.staff', input);
});
