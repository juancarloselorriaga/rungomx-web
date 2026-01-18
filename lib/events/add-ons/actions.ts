'use server';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import {
  addOnOptions,
  addOnSelections,
  addOns,
  discountRedemptions,
  eventDistances,
  eventEditions,
  registrations,
} from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import type { AuthContext } from '@/lib/auth/server';
import { isEventsEnabled } from '@/lib/features/flags';
import {
  canUserAccessEvent,
  requireOrgPermission,
} from '@/lib/organizations/permissions';
import { ADD_ON_DELIVERY_METHODS, ADD_ON_TYPES } from '../constants';

// =============================================================================
// Types
// =============================================================================

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export type AddOnData = {
  id: string;
  editionId: string;
  distanceId: string | null;
  title: string;
  description: string | null;
  type: (typeof ADD_ON_TYPES)[number];
  deliveryMethod: (typeof ADD_ON_DELIVERY_METHODS)[number];
  isActive: boolean;
  sortOrder: number;
  options: AddOnOptionData[];
};

export type AddOnOptionData = {
  id: string;
  addOnId: string;
  label: string;
  priceCents: number;
  maxQtyPerOrder: number;
  optionMeta: Record<string, unknown> | null;
  isActive: boolean;
  sortOrder: number;
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

const createAddOnSchema = z.object({
  editionId: z.string().uuid(),
  distanceId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  type: z.enum(ADD_ON_TYPES),
  deliveryMethod: z.enum(ADD_ON_DELIVERY_METHODS),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const updateAddOnSchema = z.object({
  addOnId: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  type: z.enum(ADD_ON_TYPES).optional(),
  deliveryMethod: z.enum(ADD_ON_DELIVERY_METHODS).optional(),
  distanceId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const deleteAddOnSchema = z.object({
  addOnId: z.string().uuid(),
});

const createAddOnOptionSchema = z.object({
  addOnId: z.string().uuid(),
  label: z.string().min(1).max(100),
  priceCents: z.number().int().min(0),
  maxQtyPerOrder: z.number().int().min(1).max(10).default(5),
  optionMeta: z.record(z.string(), z.unknown()).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const updateAddOnOptionSchema = z.object({
  optionId: z.string().uuid(),
  label: z.string().min(1).max(100).optional(),
  priceCents: z.number().int().min(0).optional(),
  maxQtyPerOrder: z.number().int().min(1).max(10).optional(),
  optionMeta: z.record(z.string(), z.unknown()).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const deleteAddOnOptionSchema = z.object({
  optionId: z.string().uuid(),
});

const reorderAddOnsSchema = z.object({
  editionId: z.string().uuid(),
  addOnIds: z.array(z.string().uuid()),
});

const submitAddOnSelectionsSchema = z.object({
  registrationId: z.string().uuid(),
  selections: z.array(
    z.object({
      optionId: z.string().uuid(),
      quantity: z.number().int().min(1).max(10),
    }),
  ),
});

// =============================================================================
// Add-On Actions
// =============================================================================

/**
 * Create a new add-on for an event edition.
 * Requires edit permission in the organization.
 */
export const createAddOn = withAuthenticatedUser<ActionResult<AddOnData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createAddOnSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = createAddOnSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, distanceId, title, description, type, deliveryMethod, isActive, sortOrder } =
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

  // If distanceId is provided, verify it belongs to this edition
  if (distanceId) {
    const distance = await db.query.eventDistances.findFirst({
      where: and(
        eq(eventDistances.id, distanceId),
        eq(eventDistances.editionId, editionId),
        isNull(eventDistances.deletedAt),
      ),
    });

    if (!distance) {
      return { ok: false, error: 'Distance not found for this edition', code: 'INVALID_DISTANCE' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  const addOn = await db.transaction(async (tx) => {
    const [newAddOn] = await tx
      .insert(addOns)
      .values({
        editionId,
        distanceId: distanceId || null,
        title,
        description: description || null,
        type,
        deliveryMethod,
        isActive,
        sortOrder,
      })
      .returning();

    await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'add_on.create',
        entityType: 'add_on',
        entityId: newAddOn.id,
        after: { title, type, deliveryMethod, distanceId },
        request: requestContext,
      },
      tx,
    );

    return newAddOn;
  });

  return {
    ok: true,
    data: {
      id: addOn.id,
      editionId: addOn.editionId,
      distanceId: addOn.distanceId,
      title: addOn.title,
      description: addOn.description,
      type: addOn.type,
      deliveryMethod: addOn.deliveryMethod,
      isActive: addOn.isActive,
      sortOrder: addOn.sortOrder,
      options: [],
    },
  };
});

/**
 * Update an existing add-on.
 */
export const updateAddOn = withAuthenticatedUser<ActionResult<AddOnData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateAddOnSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = updateAddOnSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { addOnId, ...updates } = validated.data;

  // Find the add-on with edition info
  const existingAddOn = await db.query.addOns.findFirst({
    where: and(eq(addOns.id, addOnId), isNull(addOns.deletedAt)),
    with: {
      edition: { with: { series: true } },
      options: { where: isNull(addOnOptions.deletedAt) },
    },
  });

  if (!existingAddOn) {
    return { ok: false, error: 'Add-on not found', code: 'NOT_FOUND' };
  }

  // Check permission
  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, existingAddOn.editionId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // If distanceId is being updated, verify it belongs to this edition
  if (updates.distanceId !== undefined && updates.distanceId !== null) {
    const distance = await db.query.eventDistances.findFirst({
      where: and(
        eq(eventDistances.id, updates.distanceId),
        eq(eventDistances.editionId, existingAddOn.editionId),
        isNull(eventDistances.deletedAt),
      ),
    });

    if (!distance) {
      return { ok: false, error: 'Distance not found for this edition', code: 'INVALID_DISTANCE' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  const updatedAddOn = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(addOns)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(addOns.id, addOnId))
      .returning();

    await createAuditLog(
      {
        organizationId: existingAddOn.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'add_on.update',
        entityType: 'add_on',
        entityId: addOnId,
        before: {
          title: existingAddOn.title,
          type: existingAddOn.type,
          deliveryMethod: existingAddOn.deliveryMethod,
          isActive: existingAddOn.isActive,
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
      id: updatedAddOn.id,
      editionId: updatedAddOn.editionId,
      distanceId: updatedAddOn.distanceId,
      title: updatedAddOn.title,
      description: updatedAddOn.description,
      type: updatedAddOn.type,
      deliveryMethod: updatedAddOn.deliveryMethod,
      isActive: updatedAddOn.isActive,
      sortOrder: updatedAddOn.sortOrder,
      options: existingAddOn.options.map((opt) => ({
        id: opt.id,
        addOnId: opt.addOnId,
        label: opt.label,
        priceCents: opt.priceCents,
        maxQtyPerOrder: opt.maxQtyPerOrder,
        optionMeta: opt.optionMeta,
        isActive: opt.isActive,
        sortOrder: opt.sortOrder,
      })),
    },
  };
});

/**
 * Soft delete an add-on.
 */
export const deleteAddOn = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof deleteAddOnSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = deleteAddOnSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { addOnId } = validated.data;

  const existingAddOn = await db.query.addOns.findFirst({
    where: and(eq(addOns.id, addOnId), isNull(addOns.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!existingAddOn) {
    return { ok: false, error: 'Add-on not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, existingAddOn.editionId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  await db.transaction(async (tx) => {
    // Soft delete the add-on
    await tx
      .update(addOns)
      .set({ deletedAt: new Date() })
      .where(eq(addOns.id, addOnId));

    // Soft delete all options
    await tx
      .update(addOnOptions)
      .set({ deletedAt: new Date() })
      .where(eq(addOnOptions.addOnId, addOnId));

    await createAuditLog(
      {
        organizationId: existingAddOn.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'add_on.delete',
        entityType: 'add_on',
        entityId: addOnId,
        before: { title: existingAddOn.title },
        request: requestContext,
      },
      tx,
    );
  });

  return { ok: true, data: undefined };
});

// =============================================================================
// Add-On Option Actions
// =============================================================================

/**
 * Create a new option for an add-on.
 */
export const createAddOnOption = withAuthenticatedUser<ActionResult<AddOnOptionData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createAddOnOptionSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = createAddOnOptionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { addOnId, label, priceCents, maxQtyPerOrder, optionMeta, isActive, sortOrder } =
    validated.data;

  const existingAddOn = await db.query.addOns.findFirst({
    where: and(eq(addOns.id, addOnId), isNull(addOns.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!existingAddOn) {
    return { ok: false, error: 'Add-on not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, existingAddOn.editionId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  const option = await db.transaction(async (tx) => {
    const [newOption] = await tx
      .insert(addOnOptions)
      .values({
        addOnId,
        label,
        priceCents,
        maxQtyPerOrder,
        optionMeta: optionMeta || null,
        isActive,
        sortOrder,
      })
      .returning();

    await createAuditLog(
      {
        organizationId: existingAddOn.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'add_on_option.create',
        entityType: 'add_on_option',
        entityId: newOption.id,
        after: { label, priceCents, addOnId },
        request: requestContext,
      },
      tx,
    );

    return newOption;
  });

  return {
    ok: true,
    data: {
      id: option.id,
      addOnId: option.addOnId,
      label: option.label,
      priceCents: option.priceCents,
      maxQtyPerOrder: option.maxQtyPerOrder,
      optionMeta: option.optionMeta,
      isActive: option.isActive,
      sortOrder: option.sortOrder,
    },
  };
});

/**
 * Update an add-on option.
 */
export const updateAddOnOption = withAuthenticatedUser<ActionResult<AddOnOptionData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateAddOnOptionSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = updateAddOnOptionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { optionId, ...updates } = validated.data;

  const existingOption = await db.query.addOnOptions.findFirst({
    where: and(eq(addOnOptions.id, optionId), isNull(addOnOptions.deletedAt)),
    with: {
      addOn: {
        with: { edition: { with: { series: true } } },
      },
    },
  });

  if (!existingOption) {
    return { ok: false, error: 'Option not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(
      authContext.user.id,
      existingOption.addOn.editionId,
    );
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  const updatedOption = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(addOnOptions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(addOnOptions.id, optionId))
      .returning();

    await createAuditLog(
      {
        organizationId: existingOption.addOn.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'add_on_option.update',
        entityType: 'add_on_option',
        entityId: optionId,
        before: {
          label: existingOption.label,
          priceCents: existingOption.priceCents,
          isActive: existingOption.isActive,
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
      id: updatedOption.id,
      addOnId: updatedOption.addOnId,
      label: updatedOption.label,
      priceCents: updatedOption.priceCents,
      maxQtyPerOrder: updatedOption.maxQtyPerOrder,
      optionMeta: updatedOption.optionMeta,
      isActive: updatedOption.isActive,
      sortOrder: updatedOption.sortOrder,
    },
  };
});

/**
 * Soft delete an add-on option.
 */
export const deleteAddOnOption = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof deleteAddOnOptionSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = deleteAddOnOptionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { optionId } = validated.data;

  const existingOption = await db.query.addOnOptions.findFirst({
    where: and(eq(addOnOptions.id, optionId), isNull(addOnOptions.deletedAt)),
    with: {
      addOn: {
        with: { edition: { with: { series: true } } },
      },
    },
  });

  if (!existingOption) {
    return { ok: false, error: 'Option not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(
      authContext.user.id,
      existingOption.addOn.editionId,
    );
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const requestContext = await getRequestContext(await headers());

  await db.transaction(async (tx) => {
    await tx
      .update(addOnOptions)
      .set({ deletedAt: new Date() })
      .where(eq(addOnOptions.id, optionId));

    await createAuditLog(
      {
        organizationId: existingOption.addOn.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'add_on_option.delete',
        entityType: 'add_on_option',
        entityId: optionId,
        before: { label: existingOption.label },
        request: requestContext,
      },
      tx,
    );
  });

  return { ok: true, data: undefined };
});

/**
 * Reorder add-ons for an edition.
 */
export const reorderAddOns = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof reorderAddOnsSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = reorderAddOnsSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, addOnIds } = validated.data;

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, editionId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Update sort order for each add-on
  await db.transaction(async (tx) => {
    for (let i = 0; i < addOnIds.length; i++) {
      await tx
        .update(addOns)
        .set({ sortOrder: i })
        .where(and(eq(addOns.id, addOnIds[i]), eq(addOns.editionId, editionId)));
    }
  });

  return { ok: true, data: undefined };
});

// =============================================================================
// Registration Actions (Public)
// =============================================================================

/**
 * Submit add-on selections for a registration.
 */
export const submitAddOnSelections = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof submitAddOnSelectionsSchema>) => {
  const validated = submitAddOnSelectionsSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { registrationId, selections } = validated.data;

  const registration = await db.query.registrations.findFirst({
    where: and(
      eq(registrations.id, registrationId),
      eq(registrations.buyerUserId, authContext.user.id),
      isNull(registrations.deletedAt),
    ),
    with: {
      edition: { with: { series: true } },
    },
  });

  if (!registration?.edition?.series) {
    return { ok: false, error: 'Registration not found', code: 'NOT_FOUND' };
  }

  const optionIds = selections.map((selection) => selection.optionId);
  const options = optionIds.length
    ? await db.query.addOnOptions.findMany({
        where: and(
          inArray(addOnOptions.id, optionIds),
          isNull(addOnOptions.deletedAt),
          eq(addOnOptions.isActive, true),
        ),
        with: {
          addOn: true,
        },
      })
    : [];

  if (optionIds.length !== options.length) {
    return { ok: false, error: 'One or more add-on options are invalid', code: 'INVALID_OPTION' };
  }

  const optionMap = new Map(options.map((option) => [option.id, option]));

  for (const selection of selections) {
    const option = optionMap.get(selection.optionId);
    if (!option) {
      return { ok: false, error: 'Add-on option not found', code: 'INVALID_OPTION' };
    }

    const addOn = option.addOn;
    const isApplicable =
      addOn.editionId === registration.editionId &&
      addOn.isActive &&
      addOn.deletedAt === null &&
      (addOn.distanceId === null || addOn.distanceId === registration.distanceId);

    if (!isApplicable) {
      return { ok: false, error: 'Add-on option is not available', code: 'INVALID_OPTION' };
    }

    if (selection.quantity > option.maxQtyPerOrder) {
      return {
        ok: false,
        error: 'Selected quantity exceeds the allowed maximum',
        code: 'QUANTITY_EXCEEDED',
      };
    }
  }

  const requestContext = await getRequestContext(await headers());

  await db.transaction(async (tx) => {
    const existingSelections = await tx.query.addOnSelections.findMany({
      where: and(
        eq(addOnSelections.registrationId, registrationId),
        isNull(addOnSelections.deletedAt),
      ),
    });

    const existingMap = new Map(existingSelections.map((s) => [s.optionId, s]));
    const nextOptionIds = new Set(optionIds);

    for (const selection of selections) {
      const option = optionMap.get(selection.optionId);
      if (!option) continue;

      const lineTotalCents = option.priceCents * selection.quantity;
      const existing = existingMap.get(selection.optionId);

      if (existing) {
        await tx
          .update(addOnSelections)
          .set({
            quantity: selection.quantity,
            lineTotalCents,
            updatedAt: new Date(),
            deletedAt: null,
          })
          .where(eq(addOnSelections.id, existing.id));
      } else {
        await tx.insert(addOnSelections).values({
          registrationId,
          optionId: selection.optionId,
          quantity: selection.quantity,
          lineTotalCents,
        });
      }
    }

    const removedSelections = existingSelections.filter(
      (selection) => !nextOptionIds.has(selection.optionId),
    );

    for (const selection of removedSelections) {
      await tx
        .update(addOnSelections)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(addOnSelections.id, selection.id));
    }

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

    const redemption = await tx.query.discountRedemptions.findFirst({
      where: eq(discountRedemptions.registrationId, registrationId),
    });

    const discountAmountCents = redemption?.discountAmountCents ?? 0;
    const basePriceCents = registration.basePriceCents ?? 0;
    const feesCents = registration.feesCents ?? 0;
    const taxCents = registration.taxCents ?? 0;

    const nextTotal = Math.max(
      0,
      basePriceCents + feesCents + taxCents + addOnTotalCents - discountAmountCents,
    );

    await tx
      .update(registrations)
      .set({ totalCents: nextTotal, updatedAt: new Date() })
      .where(eq(registrations.id, registrationId));

    await createAuditLog(
      {
        organizationId: registration.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'add_on_selections.submit',
        entityType: 'registration',
        entityId: registrationId,
        after: { selectionCount: selections.length },
        request: requestContext,
      },
      tx,
    );
  });

  return { ok: true, data: undefined };
});
