'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { eventEditions, waivers } from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { eventEditionDetailTag, publicEventBySlugTag } from '@/lib/events/cache-tags';
import { SIGNATURE_TYPES } from '@/lib/events/constants';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';
import { type ActionResult, checkEventsAccess } from '@/lib/events/shared';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a hash of the waiver body for version tracking.
 */
async function generateWaiverHash(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(body);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// =============================================================================
// Schemas
// =============================================================================

const createWaiverSchema = z.object({
  editionId: z.string().uuid(),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  signatureType: z.enum(SIGNATURE_TYPES).default('checkbox'),
});

const updateWaiverSchema = z.object({
  waiverId: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  body: z.string().min(1).optional(),
  signatureType: z.enum(SIGNATURE_TYPES).optional(),
});

const reorderWaiversSchema = z.object({
  editionId: z.string().uuid(),
  waiverIds: z.array(z.string().uuid()).min(1),
});

// =============================================================================
// Types
// =============================================================================

type WaiverData = {
  id: string;
  title: string;
  body: string;
  versionHash: string;
  signatureType: string;
  displayOrder: number;
  editionId: string;
};

// =============================================================================
// Actions
// =============================================================================

/**
 * Create a waiver for an event edition.
 */
export const createWaiver = withAuthenticatedUser<ActionResult<WaiverData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createWaiverSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = createWaiverSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, title, body, signatureType } = validated.data;

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
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const versionHash = await generateWaiverHash(body);

  const existingWaivers = await db.query.waivers.findMany({
    where: and(eq(waivers.editionId, editionId), isNull(waivers.deletedAt)),
    orderBy: (w, { desc }) => [desc(w.displayOrder)],
    limit: 1,
  });
  const nextDisplayOrder = (existingWaivers[0]?.displayOrder ?? -1) + 1;
  const requestContext = await getRequestContext(await headers());
  const waiver = await db.transaction(async (tx) => {
    const [newWaiver] = await tx
      .insert(waivers)
      .values({
        editionId,
        title,
        body,
        versionHash,
        signatureType,
        displayOrder: nextDisplayOrder,
      })
      .returning();

    const auditResult = await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'waiver.create',
        entityType: 'waiver',
        entityId: newWaiver.id,
        after: { title },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error(`Failed to create audit log: ${auditResult.error}`);
    }
    return newWaiver;
  });

  revalidateTag(eventEditionDetailTag(waiver.editionId), { expire: 0 });
  revalidateTag(publicEventBySlugTag(edition.series.slug, edition.slug), { expire: 0 });

  return {
    ok: true,
    data: {
      id: waiver.id,
      title: waiver.title,
      body: waiver.body,
      versionHash: waiver.versionHash,
      signatureType: waiver.signatureType,
      displayOrder: waiver.displayOrder,
      editionId: waiver.editionId,
    },
  };
});

/**
 * Update a waiver.
 */
export const updateWaiver = withAuthenticatedUser<ActionResult<WaiverData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateWaiverSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = updateWaiverSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { waiverId, ...updates } = validated.data;

  const waiver = await db.query.waivers.findFirst({
    where: and(eq(waivers.id, waiverId), isNull(waivers.deletedAt)),
    with: { edition: { with: { series: true } } },
  });

  if (!waiver?.edition?.series) {
    return { ok: false, error: 'Waiver not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, waiver.edition.series.organizationId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const updateData: Record<string, unknown> = {};
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.body !== undefined) {
    updateData.body = updates.body;
    updateData.versionHash = await generateWaiverHash(updates.body);
  }
  if (updates.signatureType !== undefined) updateData.signatureType = updates.signatureType;

  // Guard: reject empty updates to prevent invalid SQL
  if (Object.keys(updateData).length === 0) {
    return { ok: false, error: 'No fields to update', code: 'VALIDATION_ERROR' };
  }

  const requestContext = await getRequestContext(await headers());
  const updated = await db.transaction(async (tx) => {
    const [updatedWaiver] = await tx
      .update(waivers)
      .set(updateData)
      .where(eq(waivers.id, waiverId))
      .returning();

    // Build comprehensive before/after for audit log (include all changed fields)
    const auditBefore: Record<string, unknown> = {};
    const auditAfter: Record<string, unknown> = {};
    for (const key of Object.keys(updateData)) {
      auditBefore[key] = (waiver as never)[key];
      auditAfter[key] = (updatedWaiver as never)[key];
    }

    const auditResult = await createAuditLog(
      {
        organizationId: waiver.edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'waiver.update',
        entityType: 'waiver',
        entityId: waiverId,
        before: auditBefore,
        after: auditAfter,
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error(`Failed to create audit log: ${auditResult.error}`);
    }
    return updatedWaiver;
  });

  revalidateTag(eventEditionDetailTag(updated.editionId), { expire: 0 });
  revalidateTag(publicEventBySlugTag(waiver.edition.series.slug, waiver.edition.slug), { expire: 0 });

  return {
    ok: true,
    data: {
      id: updated.id,
      title: updated.title,
      body: updated.body,
      versionHash: updated.versionHash,
      signatureType: updated.signatureType,
      displayOrder: updated.displayOrder,
      editionId: updated.editionId,
    },
  };
});

/**
 * Reorder waivers for an event edition.
 */
export const reorderWaivers = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof reorderWaiversSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = reorderWaiversSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, waiverIds } = validated.data;

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
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const existing = await db.query.waivers.findMany({
    where: and(eq(waivers.editionId, editionId), isNull(waivers.deletedAt)),
    orderBy: (w, { asc }) => [asc(w.displayOrder)],
  });
  const existingIds = new Set(existing.map((w) => w.id));

  const allValid = waiverIds.every((id) => existingIds.has(id));
  if (!allValid || waiverIds.length !== existingIds.size) {
    return { ok: false, error: 'Waiver list mismatch', code: 'VALIDATION_ERROR' };
  }

  const requestContext = await getRequestContext(await headers());
  await db.transaction(async (tx) => {
    await Promise.all(
      waiverIds.map((id, index) =>
        tx
          .update(waivers)
          .set({ displayOrder: index })
          .where(eq(waivers.id, id)),
      ),
    );

    const auditResult = await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'waiver.reorder',
        entityType: 'waiver',
        entityId: waiverIds[0],
        before: { order: existing.map((w) => w.id) },
        after: { order: waiverIds },
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
});
