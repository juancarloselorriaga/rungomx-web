'use server';

import { auth } from '@/lib/auth';
import { requireAuthenticatedUser } from '@/lib/auth/guards';
import { resolveUserContext } from '@/lib/auth/user-context';
import {
  getSelectableExternalRoles,
  updateUserExternalRoles,
  type CanonicalRole,
} from '@/lib/auth/roles';
import type { ProfileMetadata, ProfileRequirementSummary, ProfileStatus } from '@/lib/profiles';
import { headers } from 'next/headers';
import { z } from 'zod';

const selectableRoles = getSelectableExternalRoles();
const roleSelectionSchema = z.object({
  roles: z
    .array(z.enum(selectableRoles as [CanonicalRole, ...CanonicalRole[]]))
    .nonempty(),
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

export async function assignExternalRoles(
  input: unknown
): Promise<RoleAssignmentSuccess | RoleAssignmentError> {
  try {
    const authContext = await requireAuthenticatedUser();

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
    if ((error as { code?: string })?.code === 'UNAUTHENTICATED') {
      return { ok: false, error: 'UNAUTHENTICATED' };
    }

    console.error('[roles] Failed to assign external roles', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
}
