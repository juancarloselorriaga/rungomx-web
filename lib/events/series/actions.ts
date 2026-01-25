'use server';

import { and, eq, isNull, ne } from 'drizzle-orm';
import { headers } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';

import { db } from '@/db';
import { eventEditions, eventSeries, eventSlugRedirects } from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { publicEventBySlugTag } from '@/lib/events/cache-tags';
import { SPORT_TYPES } from '@/lib/events/constants';
import { type ActionResult, checkEventsAccess } from '@/lib/events/shared';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

// =============================================================================
// Types
// =============================================================================

type EventSeriesData = {
  id: string;
  name: string;
  slug: string;
  sportType: string;
  organizationId: string;
};

// =============================================================================
// Schemas
// =============================================================================

const createEventSeriesSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  sportType: z.enum(SPORT_TYPES),
});

const renameSeriesSlugSchema = z.object({
  seriesId: z.string().uuid(),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

// =============================================================================
// Actions
// =============================================================================

/**
 * Create a new event series.
 * Requires admin or owner role in the organization.
 */
export const createEventSeries = withAuthenticatedUser<ActionResult<EventSeriesData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createEventSeriesSchema>) => {
  // Access gate: check organizer permission.
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = createEventSeriesSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { organizationId, name, slug, sportType } = validated.data;

  // Check membership and permissions
  // Internal staff with canManageEvents can access all orgs for support
  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, organizationId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Check slug uniqueness within organization
  const existing = await db.query.eventSeries.findFirst({
    where: and(
      eq(eventSeries.organizationId, organizationId),
      eq(eventSeries.slug, slug),
      isNull(eventSeries.deletedAt),
    ),
  });

  if (existing) {
    return { ok: false, error: 'Event series slug is already taken in this organization', code: 'SLUG_TAKEN' };
  }

  // Create the series and audit log in a transaction (Phase 0 requirement)
  const requestContext = await getRequestContext(await headers());
  const series = await db.transaction(async (tx) => {
    const [newSeries] = await tx
      .insert(eventSeries)
      .values({
        organizationId,
        name,
        slug,
        sportType,
        status: 'active',
      })
      .returning();

    // Write audit log in same transaction (ensures atomicity)
    const auditResult = await createAuditLog(
      {
        organizationId,
        actorUserId: authContext.user.id,
        action: 'series.create',
        entityType: 'event_series',
        entityId: newSeries.id,
        after: { name, slug, sportType },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }

    return newSeries;
  });

  return {
    ok: true,
    data: {
      id: series.id,
      name: series.name,
      slug: series.slug,
      sportType: series.sportType,
      organizationId: series.organizationId,
    },
  };
});

/**
 * Rename an event series slug and create redirects.
 */
export const renameEventSeriesSlug = withAuthenticatedUser<ActionResult<{ slug: string }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof renameSeriesSlugSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = renameSeriesSlugSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { seriesId, slug } = validated.data;

  const series = await db.query.eventSeries.findFirst({
    where: and(eq(eventSeries.id, seriesId), isNull(eventSeries.deletedAt)),
  });

  if (!series) {
    return { ok: false, error: 'Event series not found', code: 'NOT_FOUND' };
  }

  if (slug === series.slug) {
    return { ok: true, data: { slug: series.slug } };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, series.organizationId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const slugTaken = await db.query.eventSeries.findFirst({
    where: and(
      eq(eventSeries.organizationId, series.organizationId),
      eq(eventSeries.slug, slug),
      ne(eventSeries.id, seriesId),
      isNull(eventSeries.deletedAt),
    ),
    columns: { id: true },
  });

  if (slugTaken) {
    return { ok: false, error: 'Series slug is already taken in this organization', code: 'SLUG_TAKEN' };
  }

  const editions = await db.query.eventEditions.findMany({
    where: and(eq(eventEditions.seriesId, seriesId), isNull(eventEditions.deletedAt)),
    columns: { slug: true },
  });

  const requestContext = await getRequestContext(await headers());

  await db.transaction(async (tx) => {
    await tx.update(eventSeries).set({ slug }).where(eq(eventSeries.id, seriesId));

    if (editions.length > 0) {
      await tx
        .insert(eventSlugRedirects)
        .values(
          editions.map((edition) => ({
            fromSeriesSlug: series.slug,
            fromEditionSlug: edition.slug,
            toSeriesSlug: slug,
            toEditionSlug: edition.slug,
            reason: 'series_slug_change',
          })),
        )
        .onConflictDoNothing({
          target: [eventSlugRedirects.fromSeriesSlug, eventSlugRedirects.fromEditionSlug],
        });
    }

    const auditResult = await createAuditLog(
      {
        organizationId: series.organizationId,
        actorUserId: authContext.user.id,
        action: 'event.update',
        entityType: 'event_series',
        entityId: seriesId,
        before: { slug: series.slug },
        after: { slug },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }
  });

  for (const edition of editions) {
    revalidateTag(publicEventBySlugTag(series.slug, edition.slug), { expire: 0 });
    revalidateTag(publicEventBySlugTag(slug, edition.slug), { expire: 0 });
  }

  return { ok: true, data: { slug } };
});

