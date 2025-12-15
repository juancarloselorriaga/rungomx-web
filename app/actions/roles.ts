'use server';

import { auth } from '@/lib/auth';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import {
  type CanonicalRole,
  getSelectableExternalRoles,
  updateUserExternalRoles,
} from '@/lib/auth/roles';
import { resolveUserContext } from '@/lib/auth/user-context';
import { ProfileMetadata } from '@/lib/profiles/metadata';
import { ProfileRequirementSummary } from '@/lib/profiles/requirements';
import type { ProfileStatus } from '@/lib/profiles/types';
import { headers } from 'next/headers';
import { z } from 'zod';

const selectableRoles = getSelectableExternalRoles();
const roleSelectionSchema = z.object({
  roles: z.array(z.enum(selectableRoles as [CanonicalRole, ...CanonicalRole[]])).nonempty(),
});

type RoleAssignmentError =
  | { ok: false; error: 'UNAUTHENTICATED' }
  | { ok: false; error: 'FORBIDDEN' }
  | { ok: false; error: 'INVALID_INPUT'; details?: ReturnType<typeof z.treeifyError> }
  | { ok: false; error: 'SERVER_ERROR' };

type RoleAssignmentSuccess = {
  ok: true;
  canonicalRoles: CanonicalRole[];
  permissions: Awaited<ReturnType<typeof resolveUserContext>>['permissions'];
  needsRoleAssignment: boolean;
  profileStatus: ProfileStatus;
  profileRequirements: ProfileRequirementSummary;
  profileMetadata: ProfileMetadata;
};

type RoleAssignmentResult = RoleAssignmentSuccess | RoleAssignmentError;

export const assignExternalRoles = withAuthenticatedUser<RoleAssignmentResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
})(async (authContext, input: unknown) => {
  try {
    if (authContext.isInternal) {
      return { ok: false, error: 'FORBIDDEN' };
    }

    const parsed = roleSelectionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'INVALID_INPUT', details: z.treeifyError(parsed.error) };
    }

    await updateUserExternalRoles(authContext.user.id, parsed.data.roles);

    const refreshedContext = await resolveUserContext(authContext.user);

    const h = await headers();
    await auth.api.getSession({
      headers: h,
      query: { disableCookieCache: true },
    });

    return {
      ok: true,
      canonicalRoles: refreshedContext.canonicalRoles,
      permissions: refreshedContext.permissions,
      needsRoleAssignment: refreshedContext.needsRoleAssignment,
      profileStatus: refreshedContext.profileStatus,
      profileRequirements: refreshedContext.profileRequirements,
      profileMetadata: refreshedContext.profileMetadata,
    };
  } catch (error) {
    console.error('[roles] Failed to assign external roles', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
});
