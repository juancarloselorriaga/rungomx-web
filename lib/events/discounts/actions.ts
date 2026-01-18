'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { addOnSelections, discountCodes, discountRedemptions, eventEditions, registrations } from '@/db/schema';
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

export type DiscountCodeData = {
  id: string;
  editionId: string;
  code: string;
  name: string | null;
  percentOff: number;
  maxRedemptions: number | null;
  currentRedemptions: number;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
};

export type DiscountValidationResult = {
  valid: boolean;
  discountCode?: DiscountCodeData;
  discountAmountCents?: number;
  error?: string;
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

const createDiscountCodeSchema = z.object({
  editionId: z.string().uuid(),
  code: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[A-Z0-9_-]+$/i, 'Code must be alphanumeric with optional underscores/hyphens')
    .transform((val) => val.toUpperCase()),
  name: z.string().max(255).optional().nullable(),
  percentOff: z.number().int().min(1).max(100),
  maxRedemptions: z.number().int().min(1).optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
});

const updateDiscountCodeSchema = z.object({
  discountCodeId: z.string().uuid(),
  name: z.string().max(255).optional().nullable(),
  percentOff: z.number().int().min(1).max(100).optional(),
  maxRedemptions: z.number().int().min(1).optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
});

const deleteDiscountCodeSchema = z.object({
  discountCodeId: z.string().uuid(),
});

const validateDiscountCodeSchema = z.object({
  editionId: z.string().uuid(),
  code: z.string().min(1),
  basePriceCents: z.number().int().min(0),
});

const applyDiscountCodeSchema = z.object({
  registrationId: z.string().uuid(),
  code: z.string().min(1),
});

const removeDiscountCodeSchema = z.object({
  registrationId: z.string().uuid(),
});

// =============================================================================
// Organizer Actions
// =============================================================================

/**
 * Create a new discount code for an event edition.
 */
export const createDiscountCode = withAuthenticatedUser<ActionResult<DiscountCodeData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createDiscountCodeSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = createDiscountCodeSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, code, name, percentOff, maxRedemptions, startsAt, endsAt, isActive } =
    validated.data;

  // Check permission
  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, editionId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Verify the edition exists
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  // Check if code already exists for this edition
  const existingCode = await db.query.discountCodes.findFirst({
    where: and(
      eq(discountCodes.editionId, editionId),
      eq(discountCodes.code, code),
      isNull(discountCodes.deletedAt),
    ),
  });

  if (existingCode) {
    return { ok: false, error: 'A discount code with this code already exists', code: 'CODE_EXISTS' };
  }

  const requestContext = await getRequestContext(await headers());

  const discountCode = await db.transaction(async (tx) => {
    const [newCode] = await tx
      .insert(discountCodes)
      .values({
        editionId,
        code,
        name: name || null,
        percentOff,
        maxRedemptions: maxRedemptions ?? null,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        isActive,
      })
      .returning();

    await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'discount_code.create',
        entityType: 'discount_code',
        entityId: newCode.id,
        after: { code, percentOff, maxRedemptions },
        request: requestContext,
      },
      tx,
    );

    return newCode;
  });

  return {
    ok: true,
    data: {
      id: discountCode.id,
      editionId: discountCode.editionId,
      code: discountCode.code,
      name: discountCode.name,
      percentOff: discountCode.percentOff,
      maxRedemptions: discountCode.maxRedemptions,
      currentRedemptions: 0,
      startsAt: discountCode.startsAt,
      endsAt: discountCode.endsAt,
      isActive: discountCode.isActive,
    },
  };
});

/**
 * Update an existing discount code.
 */
export const updateDiscountCode = withAuthenticatedUser<ActionResult<DiscountCodeData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateDiscountCodeSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = updateDiscountCodeSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { discountCodeId, ...updates } = validated.data;

  const existingCode = await db.query.discountCodes.findFirst({
    where: and(eq(discountCodes.id, discountCodeId), isNull(discountCodes.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!existingCode) {
    return { ok: false, error: 'Discount code not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, existingCode.editionId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  // Count current redemptions
  const redemptionCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(discountRedemptions)
    .where(eq(discountRedemptions.discountCodeId, discountCodeId));

  const updatedCode = await db.transaction(async (tx) => {
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };

    if (updates.name !== undefined) updateValues.name = updates.name;
    if (updates.percentOff !== undefined) updateValues.percentOff = updates.percentOff;
    if (updates.maxRedemptions !== undefined) updateValues.maxRedemptions = updates.maxRedemptions;
    if (updates.startsAt !== undefined) {
      updateValues.startsAt = updates.startsAt ? new Date(updates.startsAt) : null;
    }
    if (updates.endsAt !== undefined) {
      updateValues.endsAt = updates.endsAt ? new Date(updates.endsAt) : null;
    }
    if (updates.isActive !== undefined) updateValues.isActive = updates.isActive;

    const [updated] = await tx
      .update(discountCodes)
      .set(updateValues)
      .where(eq(discountCodes.id, discountCodeId))
      .returning();

    await createAuditLog(
      {
        organizationId: existingCode.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'discount_code.update',
        entityType: 'discount_code',
        entityId: discountCodeId,
        before: {
          percentOff: existingCode.percentOff,
          maxRedemptions: existingCode.maxRedemptions,
          isActive: existingCode.isActive,
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
      id: updatedCode.id,
      editionId: updatedCode.editionId,
      code: updatedCode.code,
      name: updatedCode.name,
      percentOff: updatedCode.percentOff,
      maxRedemptions: updatedCode.maxRedemptions,
      currentRedemptions: redemptionCount[0].count,
      startsAt: updatedCode.startsAt,
      endsAt: updatedCode.endsAt,
      isActive: updatedCode.isActive,
    },
  };
});

/**
 * Soft delete a discount code.
 */
export const deleteDiscountCode = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof deleteDiscountCodeSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = deleteDiscountCodeSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { discountCodeId } = validated.data;

  const existingCode = await db.query.discountCodes.findFirst({
    where: and(eq(discountCodes.id, discountCodeId), isNull(discountCodes.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!existingCode) {
    return { ok: false, error: 'Discount code not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, existingCode.editionId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  await db.transaction(async (tx) => {
    await tx
      .update(discountCodes)
      .set({ deletedAt: new Date() })
      .where(eq(discountCodes.id, discountCodeId));

    await createAuditLog(
      {
        organizationId: existingCode.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'discount_code.delete',
        entityType: 'discount_code',
        entityId: discountCodeId,
        before: { code: existingCode.code },
        request: requestContext,
      },
      tx,
    );
  });

  return { ok: true, data: undefined };
});

// =============================================================================
// Registration Actions (Public)
// =============================================================================

/**
 * Validate a discount code without applying it.
 * This is used to check if a code is valid and show the discount amount.
 */
export const validateDiscountCode = withAuthenticatedUser<ActionResult<DiscountValidationResult>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (_authContext, input: z.infer<typeof validateDiscountCodeSchema>) => {
  const validated = validateDiscountCodeSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, code, basePriceCents } = validated.data;
  const upperCode = code.toUpperCase();

  const discountCode = await db.query.discountCodes.findFirst({
    where: and(
      eq(discountCodes.editionId, editionId),
      eq(discountCodes.code, upperCode),
      isNull(discountCodes.deletedAt),
    ),
  });

  if (!discountCode) {
    return {
      ok: true,
      data: { valid: false, error: 'Invalid discount code' },
    };
  }

  // Check if active
  if (!discountCode.isActive) {
    return {
      ok: true,
      data: { valid: false, error: 'This discount code is no longer active' },
    };
  }

  // Check date validity
  const now = new Date();
  if (discountCode.startsAt && now < discountCode.startsAt) {
    return {
      ok: true,
      data: { valid: false, error: 'This discount code is not yet valid' },
    };
  }
  if (discountCode.endsAt && now > discountCode.endsAt) {
    return {
      ok: true,
      data: { valid: false, error: 'This discount code has expired' },
    };
  }

  // Check redemption limit
  if (discountCode.maxRedemptions !== null) {
    const redemptionCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(discountRedemptions)
      .where(eq(discountRedemptions.discountCodeId, discountCode.id));

    if (redemptionCount[0].count >= discountCode.maxRedemptions) {
      return {
        ok: true,
        data: { valid: false, error: 'This discount code has reached its maximum uses' },
      };
    }
  }

  // Calculate discount
  const discountAmountCents = Math.round((basePriceCents * discountCode.percentOff) / 100);

  // Count current redemptions
  const redemptionCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(discountRedemptions)
    .where(eq(discountRedemptions.discountCodeId, discountCode.id));

  return {
    ok: true,
    data: {
      valid: true,
      discountCode: {
        id: discountCode.id,
        editionId: discountCode.editionId,
        code: discountCode.code,
        name: discountCode.name,
        percentOff: discountCode.percentOff,
        maxRedemptions: discountCode.maxRedemptions,
        currentRedemptions: redemptionCount[0].count,
        startsAt: discountCode.startsAt,
        endsAt: discountCode.endsAt,
        isActive: discountCode.isActive,
      },
      discountAmountCents,
    },
  };
});

/**
 * Apply a discount code to a registration.
 * This creates a redemption record and updates the registration total.
 */
export const applyDiscountCode = withAuthenticatedUser<ActionResult<{ discountAmountCents: number }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof applyDiscountCodeSchema>) => {
  const validated = applyDiscountCodeSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { registrationId, code } = validated.data;
  const upperCode = code.toUpperCase();

  // Find the registration
  const registration = await db.query.registrations.findFirst({
    where: and(eq(registrations.id, registrationId), isNull(registrations.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!registration) {
    return { ok: false, error: 'Registration not found', code: 'NOT_FOUND' };
  }

  // Verify ownership
  if (registration.buyerUserId !== authContext.user.id) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  // Check if a discount is already applied
  const existingRedemption = await db.query.discountRedemptions.findFirst({
    where: eq(discountRedemptions.registrationId, registrationId),
  });

  if (existingRedemption) {
    return { ok: false, error: 'A discount code is already applied to this registration', code: 'DISCOUNT_ALREADY_APPLIED' };
  }

  // Find and validate the discount code
  const discountCode = await db.query.discountCodes.findFirst({
    where: and(
      eq(discountCodes.editionId, registration.editionId),
      eq(discountCodes.code, upperCode),
      isNull(discountCodes.deletedAt),
    ),
  });

  if (!discountCode || !discountCode.isActive) {
    return { ok: false, error: 'Invalid discount code', code: 'INVALID_CODE' };
  }

  // Check date validity
  const now = new Date();
  if (discountCode.startsAt && now < discountCode.startsAt) {
    return { ok: false, error: 'This discount code is not yet valid', code: 'CODE_NOT_STARTED' };
  }
  if (discountCode.endsAt && now > discountCode.endsAt) {
    return { ok: false, error: 'This discount code has expired', code: 'CODE_EXPIRED' };
  }

  // Check redemption limit with locking
  const requestContext = await getRequestContext(await headers());

  const result = await db.transaction(async (tx) => {
    // Lock and count redemptions
    const redemptionCount = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(discountRedemptions)
      .where(eq(discountRedemptions.discountCodeId, discountCode.id));

    if (
      discountCode.maxRedemptions !== null &&
      redemptionCount[0].count >= discountCode.maxRedemptions
    ) {
      return { ok: false as const, error: 'This discount code has reached its maximum uses', code: 'MAX_REDEMPTIONS' };
    }

    // Calculate discount
    const basePriceCents = registration.basePriceCents || 0;
    const feesCents = registration.feesCents || 0;
    const taxCents = registration.taxCents || 0;
    const [{ total: addOnTotalCents }] = await tx
      .select({
        total: sql<number>`coalesce(sum(${addOnSelections.lineTotalCents}), 0)::int`,
      })
      .from(addOnSelections)
      .where(
        and(
          eq(addOnSelections.registrationId, registrationId),
          isNull(addOnSelections.deletedAt),
        ),
      );
    const discountAmountCents = Math.round((basePriceCents * discountCode.percentOff) / 100);

    // Create redemption
    await tx.insert(discountRedemptions).values({
      registrationId,
      discountCodeId: discountCode.id,
      discountAmountCents,
      redeemedAt: now,
    });

    // Update registration total
    const newTotal = Math.max(
      0,
      basePriceCents + feesCents + taxCents + addOnTotalCents - discountAmountCents,
    );
    await tx
      .update(registrations)
      .set({
        totalCents: newTotal,
        updatedAt: now,
      })
      .where(eq(registrations.id, registrationId));

    await createAuditLog(
      {
        organizationId: registration.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'discount_code.apply',
        entityType: 'registration',
        entityId: registrationId,
        after: { code: discountCode.code, discountAmountCents },
        request: requestContext,
      },
      tx,
    );

    return { ok: true as const, data: { discountAmountCents } };
  });

  return result;
});

/**
 * Remove a discount code from a registration.
 */
export const removeDiscountCode = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof removeDiscountCodeSchema>) => {
  const validated = removeDiscountCodeSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { registrationId } = validated.data;

  const registration = await db.query.registrations.findFirst({
    where: and(eq(registrations.id, registrationId), isNull(registrations.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!registration) {
    return { ok: false, error: 'Registration not found', code: 'NOT_FOUND' };
  }

  if (registration.buyerUserId !== authContext.user.id) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  const redemption = await db.query.discountRedemptions.findFirst({
    where: eq(discountRedemptions.registrationId, registrationId),
    with: { discountCode: true },
  });

  if (!redemption) {
    return { ok: false, error: 'No discount code applied', code: 'NO_DISCOUNT' };
  }

  const requestContext = await getRequestContext(await headers());

  await db.transaction(async (tx) => {
    // Delete redemption
    await tx
      .delete(discountRedemptions)
      .where(eq(discountRedemptions.id, redemption.id));

    // Restore registration total
    const basePriceCents = registration.basePriceCents || 0;
    const feesCents = registration.feesCents || 0;
    const taxCents = registration.taxCents || 0;
    const [{ total: addOnTotalCents }] = await tx
      .select({
        total: sql<number>`coalesce(sum(${addOnSelections.lineTotalCents}), 0)::int`,
      })
      .from(addOnSelections)
      .where(
        and(
          eq(addOnSelections.registrationId, registrationId),
          isNull(addOnSelections.deletedAt),
        ),
      );
    const newTotal = basePriceCents + feesCents + taxCents + addOnTotalCents;
    await tx
      .update(registrations)
      .set({
        totalCents: newTotal,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registrationId));

    await createAuditLog(
      {
        organizationId: registration.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'discount_code.remove',
        entityType: 'registration',
        entityId: registrationId,
        before: {
          code: redemption.discountCode.code,
          discountAmountCents: redemption.discountAmountCents,
        },
        request: requestContext,
      },
      tx,
    );
  });

  return { ok: true, data: undefined };
});
