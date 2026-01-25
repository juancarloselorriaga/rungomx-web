'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { eventEditions, eventFaqItems } from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { eventEditionDetailTag, publicEventBySlugTag } from '@/lib/events/cache-tags';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';
import { type ActionResult, checkEventsAccess } from '@/lib/events/shared';

// =============================================================================
// Schemas
// =============================================================================

const createFaqItemSchema = z.object({
  editionId: z.string().uuid(),
  question: z.string().min(1).max(500),
  answer: z.string().min(1),
});

const updateFaqItemSchema = z.object({
  faqItemId: z.string().uuid(),
  question: z.string().min(1).max(500).optional(),
  answer: z.string().min(1).optional(),
});

const deleteFaqItemSchema = z.object({
  faqItemId: z.string().uuid(),
});

const reorderFaqItemsSchema = z.object({
  editionId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()),
});

// =============================================================================
// Types
// =============================================================================

type FaqItemData = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  editionId: string;
};

// =============================================================================
// Actions
// =============================================================================

/**
 * Create a new FAQ item.
 */
export const createFaqItem = withAuthenticatedUser<ActionResult<FaqItemData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createFaqItemSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = createFaqItemSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, question, answer } = validated.data;

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
  const existingItems = await db.query.eventFaqItems.findMany({
    where: and(eq(eventFaqItems.editionId, editionId), isNull(eventFaqItems.deletedAt)),
    orderBy: (f, { desc }) => [desc(f.sortOrder)],
    limit: 1,
  });
  const nextSortOrder = (existingItems[0]?.sortOrder ?? -1) + 1;

  const requestContext = await getRequestContext(await headers());
  const faqItem = await db.transaction(async (tx) => {
    const [newItem] = await tx
      .insert(eventFaqItems)
      .values({
        editionId,
        question,
        answer,
        sortOrder: nextSortOrder,
      })
      .returning();

    const auditResult = await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'faq.create',
        entityType: 'event_faq_item',
        entityId: newItem.id,
        after: { question },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error(`Failed to create audit log: ${auditResult.error}`);
    }
    return newItem;
  });

  revalidateTag(eventEditionDetailTag(faqItem.editionId), { expire: 0 });
  revalidateTag(publicEventBySlugTag(edition.series.slug, edition.slug), { expire: 0 });

  return {
    ok: true,
    data: {
      id: faqItem.id,
      question: faqItem.question,
      answer: faqItem.answer,
      sortOrder: faqItem.sortOrder,
      editionId: faqItem.editionId,
    },
  };
});

/**
 * Update an FAQ item.
 */
export const updateFaqItem = withAuthenticatedUser<ActionResult<FaqItemData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateFaqItemSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = updateFaqItemSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { faqItemId, ...updates } = validated.data;

  const faqItem = await db.query.eventFaqItems.findFirst({
    where: and(eq(eventFaqItems.id, faqItemId), isNull(eventFaqItems.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!faqItem?.edition?.series) {
    return { ok: false, error: 'FAQ item not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, faqItem.edition.series.organizationId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const updateData: Record<string, unknown> = {};
  if (updates.question !== undefined) updateData.question = updates.question;
  if (updates.answer !== undefined) updateData.answer = updates.answer;

  // Guard: reject empty updates to prevent invalid SQL
  if (Object.keys(updateData).length === 0) {
    return { ok: false, error: 'No fields to update', code: 'VALIDATION_ERROR' };
  }

  const requestContext = await getRequestContext(await headers());
  const updated = await db.transaction(async (tx) => {
    const [updatedItem] = await tx
      .update(eventFaqItems)
      .set(updateData)
      .where(eq(eventFaqItems.id, faqItemId))
      .returning();

    // Build comprehensive before/after for audit log (include all changed fields)
    const auditBefore: Record<string, unknown> = {};
    const auditAfter: Record<string, unknown> = {};
    for (const key of Object.keys(updateData)) {
      auditBefore[key] = (faqItem as never)[key];
      auditAfter[key] = (updatedItem as never)[key];
    }

    const auditResult = await createAuditLog(
      {
        organizationId: faqItem.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'faq.update',
        entityType: 'event_faq_item',
        entityId: faqItemId,
        before: auditBefore,
        after: auditAfter,
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error(`Failed to create audit log: ${auditResult.error}`);
    }
    return updatedItem;
  });

  revalidateTag(eventEditionDetailTag(updated.editionId), { expire: 0 });
  revalidateTag(publicEventBySlugTag(faqItem.edition.series.slug, faqItem.edition.slug), { expire: 0 });

  return {
    ok: true,
    data: {
      id: updated.id,
      question: updated.question,
      answer: updated.answer,
      sortOrder: updated.sortOrder,
      editionId: updated.editionId,
    },
  };
});

/**
 * Delete an FAQ item.
 */
export const deleteFaqItem = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof deleteFaqItemSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = deleteFaqItemSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { faqItemId } = validated.data;

  const faqItem = await db.query.eventFaqItems.findFirst({
    where: and(eq(eventFaqItems.id, faqItemId), isNull(eventFaqItems.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!faqItem?.edition?.series) {
    return { ok: false, error: 'FAQ item not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, faqItem.edition.series.organizationId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const requestContext = await getRequestContext(await headers());
  await db.transaction(async (tx) => {
    await tx
      .update(eventFaqItems)
      .set({ deletedAt: new Date() })
      .where(eq(eventFaqItems.id, faqItemId));

    const auditResult = await createAuditLog(
      {
        organizationId: faqItem.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'faq.delete',
        entityType: 'event_faq_item',
        entityId: faqItemId,
        before: { question: faqItem.question },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error(`Failed to create audit log: ${auditResult.error}`);
    }
  });

  revalidateTag(eventEditionDetailTag(faqItem.editionId), { expire: 0 });
  revalidateTag(publicEventBySlugTag(faqItem.edition.series.slug, faqItem.edition.slug), { expire: 0 });

  return { ok: true, data: undefined };
});

/**
 * Reorder FAQ items.
 */
export const reorderFaqItems = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof reorderFaqItemsSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = reorderFaqItemsSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, itemIds } = validated.data;

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

  const requestContext = await getRequestContext(await headers());

  try {
    await db.transaction(async (tx) => {
      // Verify all items belong to this edition before updating
      const existingItems = await tx.query.eventFaqItems.findMany({
        where: and(
          eq(eventFaqItems.editionId, editionId),
          isNull(eventFaqItems.deletedAt),
        ),
      });

      const existingIds = new Set(existingItems.map(item => item.id));
      const invalidIds = itemIds.filter(id => !existingIds.has(id));

      if (invalidIds.length > 0) {
        throw new Error('INVALID_ITEM_IDS');
      }

      // Update each item with scoped query (editionId + id)
      for (let i = 0; i < itemIds.length; i++) {
        await tx
          .update(eventFaqItems)
          .set({ sortOrder: i })
          .where(
            and(
              eq(eventFaqItems.id, itemIds[i]),
              eq(eventFaqItems.editionId, editionId),
              isNull(eventFaqItems.deletedAt),
            ),
          );
      }

      const auditResult = await createAuditLog(
        {
          organizationId: edition.series.organizationId,
          actorUserId: authContext.user.id,
          action: 'faq.reorder',
          entityType: 'event_edition',
          entityId: editionId,
          after: { itemIds },
          request: requestContext,
        },
        tx,
      );

      if (!auditResult.ok) {
        throw new Error(`Failed to create audit log: ${auditResult.error}`);
      }
    });

    revalidateTag(eventEditionDetailTag(editionId), { expire: 0 });
    revalidateTag(publicEventBySlugTag(edition.series.slug, edition.slug), { expire: 0 });

    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_ITEM_IDS') {
      return { ok: false, error: 'One or more FAQ items do not belong to this edition', code: 'INVALID_INPUT' };
    }
    throw error;
  }
});
