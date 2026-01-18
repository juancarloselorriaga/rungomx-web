'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { organizationPayoutProfiles, organizations } from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import type { AuthContext } from '@/lib/auth/server';
import { isEventsEnabled } from '@/lib/features/flags';
import { getOrgMembership } from '@/lib/organizations/permissions';

// =============================================================================
// Types
// =============================================================================

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export type PayoutProfileData = {
  id: string;
  organizationId: string;
  legalName: string | null;
  rfc: string | null;
  payoutDestination: {
    bankName?: string;
    clabe?: string;
    accountHolder?: string;
  } | null;
};

// =============================================================================
// Helpers
// =============================================================================

function checkEventsAccess(authContext: AuthContext): { error: string; code: string } | null {
  if (authContext.permissions.canManageEvents) {
    return null;
  }

  if (!isEventsEnabled()) {
    return {
      error: 'Events platform is not enabled',
      code: 'FEATURE_DISABLED',
    };
  }

  if (!authContext.permissions.canViewOrganizersDashboard) {
    return {
      error: 'You do not have permission to manage events',
      code: 'FORBIDDEN',
    };
  }

  return null;
}

// =============================================================================
// Schemas
// =============================================================================

// RFC validation (Mexican tax ID)
const rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;

// CLABE validation (18-digit Mexican bank account)
const clabeRegex = /^\d{18}$/;

const updatePayoutProfileSchema = z.object({
  organizationId: z.string().uuid(),
  legalName: z.string().max(255).optional().nullable(),
  rfc: z
    .string()
    .regex(rfcRegex, 'Invalid RFC format')
    .transform((val) => val.toUpperCase())
    .optional()
    .nullable(),
  payoutDestination: z
    .object({
      bankName: z.string().max(100).optional(),
      clabe: z.string().regex(clabeRegex, 'CLABE must be 18 digits').optional(),
      accountHolder: z.string().max(255).optional(),
    })
    .optional()
    .nullable(),
});

// =============================================================================
// Actions
// =============================================================================

/**
 * Get the payout profile for an organization.
 * Requires Owner or Admin role.
 */
export const getPayoutProfile = withAuthenticatedUser<ActionResult<PayoutProfileData | null>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: { organizationId: string }) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const { organizationId } = input;

  // Verify organization exists
  const org = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)),
  });

  if (!org) {
    return { ok: false, error: 'Organization not found', code: 'NOT_FOUND' };
  }

  // Check permission - only Owner or Admin can view payout profile
  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, organizationId);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return { ok: false, error: 'Permission denied. Only owners and admins can view payout settings.', code: 'FORBIDDEN' };
    }
  }

  // Audit the read
  const requestContext = await getRequestContext(await headers());
  await createAuditLog({
    organizationId,
    actorUserId: authContext.user.id,
    action: 'payout_profile.read',
    entityType: 'organization_payout_profile',
    entityId: organizationId,
    request: requestContext,
  });

  // Fetch profile
  const profile = await db.query.organizationPayoutProfiles.findFirst({
    where: and(
      eq(organizationPayoutProfiles.organizationId, organizationId),
      isNull(organizationPayoutProfiles.deletedAt),
    ),
  });

  if (!profile) {
    return { ok: true, data: null };
  }

  return {
    ok: true,
    data: {
      id: profile.id,
      organizationId: profile.organizationId,
      legalName: profile.legalName,
      rfc: profile.rfc,
      payoutDestination: profile.payoutDestinationJson as PayoutProfileData['payoutDestination'],
    },
  };
});

/**
 * Update the payout profile for an organization.
 * Requires Owner or Admin role.
 */
export const updatePayoutProfile = withAuthenticatedUser<ActionResult<PayoutProfileData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updatePayoutProfileSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = updatePayoutProfileSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { organizationId, legalName, rfc, payoutDestination } = validated.data;

  // Verify organization exists
  const org = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)),
  });

  if (!org) {
    return { ok: false, error: 'Organization not found', code: 'NOT_FOUND' };
  }

  // Check permission - only Owner or Admin can update payout profile
  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, organizationId);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return { ok: false, error: 'Permission denied. Only owners and admins can update payout settings.', code: 'FORBIDDEN' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  // Check if profile exists
  const existingProfile = await db.query.organizationPayoutProfiles.findFirst({
    where: and(
      eq(organizationPayoutProfiles.organizationId, organizationId),
      isNull(organizationPayoutProfiles.deletedAt),
    ),
  });

  const profile = await db.transaction(async (tx) => {
    let updatedProfile;

    if (existingProfile) {
      // Update existing profile
      const updateValues: Record<string, unknown> = { updatedAt: new Date() };

      if (legalName !== undefined) updateValues.legalName = legalName;
      if (rfc !== undefined) updateValues.rfc = rfc;
      if (payoutDestination !== undefined) updateValues.payoutDestinationJson = payoutDestination;

      [updatedProfile] = await tx
        .update(organizationPayoutProfiles)
        .set(updateValues)
        .where(eq(organizationPayoutProfiles.id, existingProfile.id))
        .returning();

      await createAuditLog(
        {
          organizationId,
          actorUserId: authContext.user.id,
          action: 'payout_profile.update',
          entityType: 'organization_payout_profile',
          entityId: existingProfile.id,
          before: {
            legalName: existingProfile.legalName,
            rfc: existingProfile.rfc ? '***REDACTED***' : null,
            hasBankInfo: !!existingProfile.payoutDestinationJson,
          },
          after: {
            legalName,
            rfc: rfc ? '***REDACTED***' : null,
            hasBankInfo: !!payoutDestination,
          },
          request: requestContext,
        },
        tx,
      );
    } else {
      // Create new profile
      [updatedProfile] = await tx
        .insert(organizationPayoutProfiles)
        .values({
          organizationId,
          legalName: legalName || null,
          rfc: rfc || null,
          payoutDestinationJson: payoutDestination || null,
        })
        .returning();

      await createAuditLog(
        {
          organizationId,
          actorUserId: authContext.user.id,
          action: 'payout_profile.create',
          entityType: 'organization_payout_profile',
          entityId: updatedProfile.id,
          after: {
            legalName,
            rfc: rfc ? '***REDACTED***' : null,
            hasBankInfo: !!payoutDestination,
          },
          request: requestContext,
        },
        tx,
      );
    }

    return updatedProfile;
  });

  return {
    ok: true,
    data: {
      id: profile.id,
      organizationId: profile.organizationId,
      legalName: profile.legalName,
      rfc: profile.rfc,
      payoutDestination: profile.payoutDestinationJson as PayoutProfileData['payoutDestination'],
    },
  };
});
