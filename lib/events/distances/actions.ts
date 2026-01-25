'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { eventDistances, eventEditions, pricingTiers, registrations } from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import {
  eventEditionDetailTag,
  eventEditionPricingTag,
  publicEventBySlugTag,
} from '@/lib/events/cache-tags';
import {
  CAPACITY_SCOPES,
  DISTANCE_KINDS,
  DISTANCE_UNITS,
  TERRAIN_TYPES,
} from '@/lib/events/constants';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';
import { type ActionResult, checkEventsAccess } from '@/lib/events/shared';

// =============================================================================
// Schemas
// =============================================================================

const createDistanceSchema = z.object({
  editionId: z.string().uuid(),
  label: z.string().min(1).max(100),
  distanceValue: z.number().positive().optional(),
  distanceUnit: z.enum(DISTANCE_UNITS).default('km'),
  kind: z.enum(DISTANCE_KINDS).default('distance'),
  startTimeLocal: z.string().datetime().optional(),
  timeLimitMinutes: z.number().int().positive().optional(),
  terrain: z.enum(TERRAIN_TYPES).optional(),
  isVirtual: z.boolean().default(false),
  capacity: z.number().int().positive().optional(),
  capacityScope: z.enum(CAPACITY_SCOPES).default('per_distance'),
  priceCents: z.number().int().nonnegative(), // Required initial price
});

const updateDistanceSchema = z.object({
  distanceId: z.string().uuid(),
  label: z.string().min(1).max(100).optional(),
  distanceValue: z.number().positive().optional().nullable(),
  distanceUnit: z.enum(DISTANCE_UNITS).optional(),
  kind: z.enum(DISTANCE_KINDS).optional(),
  startTimeLocal: z.string().datetime().optional().nullable(),
  timeLimitMinutes: z.number().int().positive().optional().nullable(),
  terrain: z.enum(TERRAIN_TYPES).optional().nullable(),
  isVirtual: z.boolean().optional(),
  capacity: z.number().int().positive().optional().nullable(),
  capacityScope: z.enum(CAPACITY_SCOPES).optional(),
});

const deleteDistanceSchema = z.object({
  distanceId: z.string().uuid(),
});

const updateDistancePriceSchema = z.object({
  distanceId: z.string().uuid(),
  priceCents: z.number().int().nonnegative(),
});

// =============================================================================
// Types
// =============================================================================

type DistanceData = {
  id: string;
  label: string;
  distanceValue: string | null;
  distanceUnit: string;
  kind: string;
  capacity: number | null;
  capacityScope: string;
  isVirtual: boolean;
  editionId: string;
};

// =============================================================================
// Actions
// =============================================================================

/**
 * Create a new distance for an event edition.
 * Also creates the initial pricing tier.
 */
export const createDistance = withAuthenticatedUser<ActionResult<DistanceData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createDistanceSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = createDistanceSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, priceCents, ...distanceData } = validated.data;

  // Get edition and check permissions
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, edition.series.organizationId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Get max sort order
  const existingDistances = await db.query.eventDistances.findMany({
    where: and(eq(eventDistances.editionId, editionId), isNull(eventDistances.deletedAt)),
    orderBy: (d, { desc }) => [desc(d.sortOrder)],
    limit: 1,
  });
  const nextSortOrder = (existingDistances[0]?.sortOrder ?? -1) + 1;

  const requestContext = await getRequestContext(await headers());
  const resolvedCapacityScope = edition.sharedCapacity ? 'shared_pool' : distanceData.capacityScope;
  const distance = await db.transaction(async (tx) => {
    const [newDistance] = await tx
      .insert(eventDistances)
      .values({
        editionId,
        label: distanceData.label,
        distanceValue: distanceData.distanceValue?.toString(),
        distanceUnit: distanceData.distanceUnit,
        kind: distanceData.kind,
        startTimeLocal: distanceData.startTimeLocal ? new Date(distanceData.startTimeLocal) : undefined,
        timeLimitMinutes: distanceData.timeLimitMinutes,
        terrain: distanceData.terrain,
        isVirtual: distanceData.isVirtual,
        capacity: distanceData.capacity,
        capacityScope: resolvedCapacityScope,
        sortOrder: nextSortOrder,
      })
      .returning();

    // Create initial pricing tier (v1: single price)
    await tx.insert(pricingTiers).values({
      distanceId: newDistance.id,
      label: 'Standard',
      priceCents,
      currency: 'MXN',
      sortOrder: 0,
    });

    const auditResult = await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'distance.create',
        entityType: 'event_distance',
        entityId: newDistance.id,
        after: { label: distanceData.label, priceCents },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error(`Failed to create audit log: ${auditResult.error}`);
    }

    return newDistance;
  });

  revalidateTag(eventEditionDetailTag(editionId), { expire: 0 });
  revalidateTag(eventEditionPricingTag(editionId), { expire: 0 });
  revalidateTag(publicEventBySlugTag(edition.series.slug, edition.slug), { expire: 0 });

  return {
    ok: true,
    data: {
      id: distance.id,
      label: distance.label,
      distanceValue: distance.distanceValue,
      distanceUnit: distance.distanceUnit,
      kind: distance.kind,
      capacity: distance.capacity,
      capacityScope: distance.capacityScope,
      isVirtual: distance.isVirtual,
      editionId: distance.editionId,
    },
  };
});

/**
 * Update a distance.
 */
export const updateDistance = withAuthenticatedUser<ActionResult<DistanceData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateDistanceSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = updateDistanceSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { distanceId, ...updates } = validated.data;

  // Get distance and check permissions
  const distance = await db.query.eventDistances.findFirst({
    where: and(eq(eventDistances.id, distanceId), isNull(eventDistances.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!distance?.edition?.series) {
    return { ok: false, error: 'Distance not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, distance.edition.series.organizationId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const updateData: Record<string, unknown> = {};
  if (updates.label !== undefined) updateData.label = updates.label;
  if (updates.distanceValue !== undefined) {
    updateData.distanceValue = updates.distanceValue === null ? null : updates.distanceValue.toString();
  }
  if (updates.distanceUnit !== undefined) updateData.distanceUnit = updates.distanceUnit;
  if (updates.kind !== undefined) updateData.kind = updates.kind;
  if (updates.startTimeLocal !== undefined) updateData.startTimeLocal = updates.startTimeLocal ? new Date(updates.startTimeLocal) : null;
  if (updates.timeLimitMinutes !== undefined) updateData.timeLimitMinutes = updates.timeLimitMinutes;
  if (updates.terrain !== undefined) updateData.terrain = updates.terrain;
  if (updates.isVirtual !== undefined) updateData.isVirtual = updates.isVirtual;
  if (updates.capacity !== undefined) updateData.capacity = updates.capacity;
  if (updates.capacityScope !== undefined) updateData.capacityScope = updates.capacityScope;

  // Guard: reject empty updates to prevent invalid SQL
  if (Object.keys(updateData).length === 0) {
    return { ok: false, error: 'No fields to update', code: 'VALIDATION_ERROR' };
  }

  const requestContext = await getRequestContext(await headers());
  const updated = await db.transaction(async (tx) => {
    const [updatedDistance] = await tx
      .update(eventDistances)
      .set(updateData)
      .where(eq(eventDistances.id, distanceId))
      .returning();

    // Build comprehensive before/after for audit log (include all changed fields)
    const auditBefore: Record<string, unknown> = {};
    const auditAfter: Record<string, unknown> = {};
    for (const key of Object.keys(updateData)) {
      auditBefore[key] = (distance as never)[key];
      auditAfter[key] = (updatedDistance as never)[key];
    }

    const auditResult = await createAuditLog(
      {
        organizationId: distance.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'distance.update',
        entityType: 'event_distance',
        entityId: distanceId,
        before: auditBefore,
        after: auditAfter,
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error(`Failed to create audit log: ${auditResult.error}`);
    }

    return updatedDistance;
  });

  revalidateTag(eventEditionDetailTag(updated.editionId), { expire: 0 });
  revalidateTag(eventEditionPricingTag(updated.editionId), { expire: 0 });
  revalidateTag(publicEventBySlugTag(distance.edition.series.slug, distance.edition.slug), { expire: 0 });

  return {
    ok: true,
    data: {
      id: updated.id,
      label: updated.label,
      distanceValue: updated.distanceValue,
      distanceUnit: updated.distanceUnit,
      kind: updated.kind,
      capacity: updated.capacity,
      capacityScope: updated.capacityScope,
      isVirtual: updated.isVirtual,
      editionId: updated.editionId,
    },
  };
});

/**
 * Soft-delete a distance.
 */
export const deleteDistance = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof deleteDistanceSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = deleteDistanceSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { distanceId } = validated.data;

  const distance = await db.query.eventDistances.findFirst({
    where: and(eq(eventDistances.id, distanceId), isNull(eventDistances.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!distance?.edition?.series) {
    return { ok: false, error: 'Distance not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, distance.edition.series.organizationId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Check if there are any registrations for this distance
  const existingRegistrations = await db.query.registrations.findFirst({
    where: and(eq(registrations.distanceId, distanceId), isNull(registrations.deletedAt)),
  });

  if (existingRegistrations) {
    return { ok: false, error: 'Cannot delete distance with existing registrations', code: 'HAS_REGISTRATIONS' };
  }

  const requestContext = await getRequestContext(await headers());
  await db.transaction(async (tx) => {
    await tx
      .update(eventDistances)
      .set({ deletedAt: new Date() })
      .where(eq(eventDistances.id, distanceId));

    const auditResult = await createAuditLog(
      {
        organizationId: distance.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'distance.delete',
        entityType: 'event_distance',
        entityId: distanceId,
        before: { label: distance.label },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error(`Failed to create audit log: ${auditResult.error}`);
    }
  });

  revalidateTag(eventEditionDetailTag(distance.editionId), { expire: 0 });
  revalidateTag(eventEditionPricingTag(distance.editionId), { expire: 0 });
  revalidateTag(publicEventBySlugTag(distance.edition.series.slug, distance.edition.slug), { expire: 0 });

  return { ok: true, data: undefined };
});

/**
 * Update distance price (v1: single price).
 */
export const updateDistancePrice = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateDistancePriceSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = updateDistancePriceSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { distanceId, priceCents } = validated.data;

  const distance = await db.query.eventDistances.findFirst({
    where: and(eq(eventDistances.id, distanceId), isNull(eventDistances.deletedAt)),
    with: { edition: { with: { series: true } }, pricingTiers: true },
  });

  if (!distance?.edition?.series) {
    return { ok: false, error: 'Distance not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, distance.edition.series.organizationId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const requestContext = await getRequestContext(await headers());
  await db.transaction(async (tx) => {
    // Update the first (and only in v1) pricing tier
    const tier = distance.pricingTiers.find(t => !t.deletedAt);
    if (tier) {
      await tx
        .update(pricingTiers)
        .set({ priceCents })
        .where(eq(pricingTiers.id, tier.id));
    } else {
      // Create if doesn't exist
      await tx.insert(pricingTiers).values({
        distanceId,
        label: 'Standard',
        priceCents,
        currency: 'MXN',
        sortOrder: 0,
      });
    }

    const auditResult = await createAuditLog(
      {
        organizationId: distance.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'distance.update_price',
        entityType: 'event_distance',
        entityId: distanceId,
        before: { priceCents: tier?.priceCents },
        after: { priceCents },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error(`Failed to create audit log: ${auditResult.error}`);
    }
  });

  revalidateTag(eventEditionDetailTag(distance.editionId), { expire: 0 });
  revalidateTag(eventEditionPricingTag(distance.editionId), { expire: 0 });
  revalidateTag(publicEventBySlugTag(distance.edition.series.slug, distance.edition.slug), { expire: 0 });

  return { ok: true, data: undefined };
});
