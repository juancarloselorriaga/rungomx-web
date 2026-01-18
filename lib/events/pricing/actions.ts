'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { eventDistances, pricingTiers } from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import type { AuthContext } from '@/lib/auth/server';
import { isEventsEnabled } from '@/lib/features/flags';
import {
  canUserAccessEvent,
  requireOrgPermission,
} from '@/lib/organizations/permissions';

// =============================================================================
// Types
// =============================================================================

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export type PricingTierData = {
  id: string;
  distanceId: string;
  label: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  priceCents: number;
  currency: string;
  sortOrder: number;
};

export type CurrentPricing = {
  currentTier: PricingTierData | null;
  nextTier: PricingTierData | null;
  allTiers: PricingTierData[];
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

/**
 * Check if two date ranges overlap.
 */
function dateRangesOverlap(
  start1: Date | null,
  end1: Date | null,
  start2: Date | null,
  end2: Date | null,
): boolean {
  // If either range has no bounds, they potentially overlap
  // We use a simple interpretation: ranges overlap unless one clearly ends before the other starts
  const effectiveStart1 = start1 || new Date(0);
  const effectiveEnd1 = end1 || new Date('9999-12-31');
  const effectiveStart2 = start2 || new Date(0);
  const effectiveEnd2 = end2 || new Date('9999-12-31');

  return effectiveStart1 < effectiveEnd2 && effectiveEnd1 > effectiveStart2;
}

// =============================================================================
// Schemas
// =============================================================================

const createPricingTierSchema = z.object({
  distanceId: z.string().uuid(),
  label: z.string().max(100).optional().nullable(),
  startsAt: z.string().datetime({ local: true }).optional().nullable(),
  endsAt: z.string().datetime({ local: true }).optional().nullable(),
  priceCents: z.number().int().min(0),
  currency: z.string().length(3).default('MXN'),
}).refine(
  (data) => {
    if (data.startsAt && data.endsAt) {
      return new Date(data.startsAt) < new Date(data.endsAt);
    }
    return true;
  },
  {
    message: 'Start date must be before end date',
    path: ['startsAt'],
  },
);

const updatePricingTierSchema = z.object({
  tierId: z.string().uuid(),
  label: z.string().max(100).optional().nullable(),
  startsAt: z.string().datetime({ local: true }).optional().nullable(),
  endsAt: z.string().datetime({ local: true }).optional().nullable(),
  priceCents: z.number().int().min(0).optional(),
  sortOrder: z.number().int().optional(),
}).refine(
  (data) => {
    if (data.startsAt && data.endsAt) {
      return new Date(data.startsAt) < new Date(data.endsAt);
    }
    return true;
  },
  {
    message: 'Start date must be before end date',
    path: ['startsAt'],
  },
);

const deletePricingTierSchema = z.object({
  tierId: z.string().uuid(),
});

const reorderPricingTiersSchema = z.object({
  distanceId: z.string().uuid(),
  tierIds: z.array(z.string().uuid()),
});

// =============================================================================
// Actions
// =============================================================================

/**
 * Create a new pricing tier for a distance.
 */
export const createPricingTier = withAuthenticatedUser<ActionResult<PricingTierData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createPricingTierSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = createPricingTierSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { distanceId, label, startsAt, endsAt, priceCents, currency } = validated.data;

  // Find the distance and verify permission
  const distance = await db.query.eventDistances.findFirst({
    where: and(eq(eventDistances.id, distanceId), isNull(eventDistances.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!distance?.edition?.series) {
    return { ok: false, error: 'Distance not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, distance.editionId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Check for overlapping date ranges
  const existingTiers = await db.query.pricingTiers.findMany({
    where: and(eq(pricingTiers.distanceId, distanceId), isNull(pricingTiers.deletedAt)),
  });

  const newStart = startsAt ? new Date(startsAt) : null;
  const newEnd = endsAt ? new Date(endsAt) : null;

  for (const tier of existingTiers) {
    if (dateRangesOverlap(newStart, newEnd, tier.startsAt, tier.endsAt)) {
      return {
        ok: false,
        error: `Date range overlaps with existing tier "${tier.label || 'Unnamed'}"`,
        code: 'DATE_OVERLAP',
      };
    }
  }

  const requestContext = await getRequestContext(await headers());

  // Get the next sort order
  const maxSortOrder = existingTiers.reduce((max, t) => Math.max(max, t.sortOrder), -1);

  const tier = await db.transaction(async (tx) => {
    const [newTier] = await tx
      .insert(pricingTiers)
      .values({
        distanceId,
        label: label || null,
        startsAt: newStart,
        endsAt: newEnd,
        priceCents,
        currency,
        sortOrder: maxSortOrder + 1,
      })
      .returning();

    await createAuditLog(
      {
        organizationId: distance.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'pricing.create',
        entityType: 'pricing_tier',
        entityId: newTier.id,
        after: { label, priceCents, startsAt, endsAt },
        request: requestContext,
      },
      tx,
    );

    return newTier;
  });

  return {
    ok: true,
    data: {
      id: tier.id,
      distanceId: tier.distanceId,
      label: tier.label,
      startsAt: tier.startsAt,
      endsAt: tier.endsAt,
      priceCents: tier.priceCents,
      currency: tier.currency,
      sortOrder: tier.sortOrder,
    },
  };
});

/**
 * Update a pricing tier.
 */
export const updatePricingTier = withAuthenticatedUser<ActionResult<PricingTierData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updatePricingTierSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = updatePricingTierSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { tierId, ...updates } = validated.data;

  const existingTier = await db.query.pricingTiers.findFirst({
    where: and(eq(pricingTiers.id, tierId), isNull(pricingTiers.deletedAt)),
    with: {
      distance: {
        with: { edition: { with: { series: true } } },
      },
    },
  });

  if (!existingTier?.distance?.edition?.series) {
    return { ok: false, error: 'Pricing tier not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, existingTier.distance.editionId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Check for overlapping date ranges if dates are being updated
  if (updates.startsAt !== undefined || updates.endsAt !== undefined) {
    const otherTiers = await db.query.pricingTiers.findMany({
      where: and(
        eq(pricingTiers.distanceId, existingTier.distanceId),
        isNull(pricingTiers.deletedAt),
      ),
    });

    const newStart = updates.startsAt !== undefined
      ? (updates.startsAt ? new Date(updates.startsAt) : null)
      : existingTier.startsAt;
    const newEnd = updates.endsAt !== undefined
      ? (updates.endsAt ? new Date(updates.endsAt) : null)
      : existingTier.endsAt;

    for (const tier of otherTiers) {
      if (tier.id === tierId) continue;
      if (dateRangesOverlap(newStart, newEnd, tier.startsAt, tier.endsAt)) {
        return {
          ok: false,
          error: `Date range overlaps with existing tier "${tier.label || 'Unnamed'}"`,
          code: 'DATE_OVERLAP',
        };
      }
    }
  }

  const requestContext = await getRequestContext(await headers());

  const updatedTier = await db.transaction(async (tx) => {
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };

    if (updates.label !== undefined) updateValues.label = updates.label;
    if (updates.priceCents !== undefined) updateValues.priceCents = updates.priceCents;
    if (updates.sortOrder !== undefined) updateValues.sortOrder = updates.sortOrder;
    if (updates.startsAt !== undefined) {
      updateValues.startsAt = updates.startsAt ? new Date(updates.startsAt) : null;
    }
    if (updates.endsAt !== undefined) {
      updateValues.endsAt = updates.endsAt ? new Date(updates.endsAt) : null;
    }

    const [updated] = await tx
      .update(pricingTiers)
      .set(updateValues)
      .where(eq(pricingTiers.id, tierId))
      .returning();

    await createAuditLog(
      {
        organizationId: existingTier.distance.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'pricing.update',
        entityType: 'pricing_tier',
        entityId: tierId,
        before: {
          label: existingTier.label,
          priceCents: existingTier.priceCents,
          startsAt: existingTier.startsAt?.toISOString(),
          endsAt: existingTier.endsAt?.toISOString(),
        },
        after: updates,
        request: requestContext,
      },
      tx,
    );

    return updated;
  });

  return {
    ok: true,
    data: {
      id: updatedTier.id,
      distanceId: updatedTier.distanceId,
      label: updatedTier.label,
      startsAt: updatedTier.startsAt,
      endsAt: updatedTier.endsAt,
      priceCents: updatedTier.priceCents,
      currency: updatedTier.currency,
      sortOrder: updatedTier.sortOrder,
    },
  };
});

/**
 * Soft delete a pricing tier.
 */
export const deletePricingTier = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof deletePricingTierSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = deletePricingTierSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { tierId } = validated.data;

  const existingTier = await db.query.pricingTiers.findFirst({
    where: and(eq(pricingTiers.id, tierId), isNull(pricingTiers.deletedAt)),
    with: {
      distance: {
        with: { edition: { with: { series: true } } },
      },
    },
  });

  if (!existingTier?.distance?.edition?.series) {
    return { ok: false, error: 'Pricing tier not found', code: 'NOT_FOUND' };
  }

  // Check if this is the only tier
  const tierCount = await db.query.pricingTiers.findMany({
    where: and(
      eq(pricingTiers.distanceId, existingTier.distanceId),
      isNull(pricingTiers.deletedAt),
    ),
  });

  if (tierCount.length <= 1) {
    return {
      ok: false,
      error: 'Cannot delete the only pricing tier. Each distance must have at least one price.',
      code: 'CANNOT_DELETE_LAST_TIER',
    };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, existingTier.distance.editionId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  await db.transaction(async (tx) => {
    await tx
      .update(pricingTiers)
      .set({ deletedAt: new Date() })
      .where(eq(pricingTiers.id, tierId));

    await createAuditLog(
      {
        organizationId: existingTier.distance.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'pricing.delete',
        entityType: 'pricing_tier',
        entityId: tierId,
        before: { label: existingTier.label, priceCents: existingTier.priceCents },
        request: requestContext,
      },
      tx,
    );
  });

  return { ok: true, data: undefined };
});

/**
 * Reorder pricing tiers for a distance.
 */
export const reorderPricingTiers = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof reorderPricingTiersSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = reorderPricingTiersSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { distanceId, tierIds } = validated.data;

  const distance = await db.query.eventDistances.findFirst({
    where: and(eq(eventDistances.id, distanceId), isNull(eventDistances.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!distance?.edition?.series) {
    return { ok: false, error: 'Distance not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, distance.editionId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < tierIds.length; i++) {
      await tx
        .update(pricingTiers)
        .set({ sortOrder: i })
        .where(and(eq(pricingTiers.id, tierIds[i]), eq(pricingTiers.distanceId, distanceId)));
    }
  });

  return { ok: true, data: undefined };
});
