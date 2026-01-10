'use server';

import { customAlphabet } from 'nanoid';
import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { eventEditions, eventSeries } from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import type { AuthContext } from '@/lib/auth/server';
import { isEventsEnabled } from '@/lib/features/flags';
import {
  canUserAccessSeries,
  getOrgMembership,
  requireOrgPermission,
} from '@/lib/organizations/permissions';

import { EVENT_VISIBILITY, SPORT_TYPES } from './constants';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a unique public code for an event edition.
 * Format: 6 uppercase alphanumeric characters (e.g., "ABC123")
 */
const generatePublicCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

/**
 * Check if the user has permission to access the events platform.
 * Phase 0 gate: external organizers require feature flag + organizer dashboard permission,
 * internal staff bypass via canManageEvents.
 *
 * @param authContext - The authenticated user context
 * @returns Error object if access denied, null if allowed
 */
function checkEventsAccess(authContext: AuthContext): { error: string; code: string } | null {
  // Internal staff with canManageEvents can always access
  if (authContext.permissions.canManageEvents) {
    return null;
  }

  // External organizers need the feature flag enabled AND organizer dashboard permission
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

const createEventEditionSchema = z.object({
  seriesId: z.string().uuid(),
  editionLabel: z.string().min(1).max(50),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  timezone: z.string().min(1).max(50).default('America/Mexico_City'),
  locationDisplay: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).default('MX'),
  externalUrl: z.string().url().max(500).optional(),
});

const updateEventEditionSchema = z.object({
  editionId: z.string().uuid(),
  editionLabel: z.string().min(1).max(50).optional(),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  timezone: z.string().min(1).max(50).optional(),
  registrationOpensAt: z.string().datetime().optional().nullable(),
  registrationClosesAt: z.string().datetime().optional().nullable(),
  locationDisplay: z.string().max(255).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  externalUrl: z.string().url().max(500).optional().nullable(),
});

const updateEventVisibilitySchema = z.object({
  editionId: z.string().uuid(),
  visibility: z.enum(EVENT_VISIBILITY),
});

const pauseRegistrationSchema = z.object({
  editionId: z.string().uuid(),
  paused: z.boolean(),
});

const checkSlugAvailabilitySchema = z.object({
  organizationId: z.string().uuid().optional(),
  seriesId: z.string().uuid().optional(),
  slug: z.string().min(2).max(100),
});

// =============================================================================
// Types
// =============================================================================

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

type EventSeriesData = {
  id: string;
  name: string;
  slug: string;
  sportType: string;
  organizationId: string;
};

type EventEditionData = {
  id: string;
  publicCode: string;
  editionLabel: string;
  slug: string;
  visibility: string;
  seriesId: string;
};

// =============================================================================
// Event Series Actions
// =============================================================================

/**
 * Create a new event series.
 * Requires admin or owner role in the organization.
 */
export const createEventSeries = withAuthenticatedUser<ActionResult<EventSeriesData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createEventSeriesSchema>) => {
  // Phase 0 gate: check global organizer permission + feature flag
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

// =============================================================================
// Event Edition Actions
// =============================================================================

/**
 * Create a new event edition within a series.
 * Requires edit permission in the organization.
 */
export const createEventEdition = withAuthenticatedUser<ActionResult<EventEditionData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createEventEditionSchema>) => {
  // Phase 0 gate: check global organizer permission + feature flag
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = createEventEditionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { seriesId, editionLabel, slug, startsAt, endsAt, timezone, locationDisplay, city, state, country, externalUrl } = validated.data;

  // Check membership via series (internal staff with canManageEvents bypass this check)
  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessSeries(authContext.user.id, seriesId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Get series to get organization ID
  const series = await db.query.eventSeries.findFirst({
    where: and(eq(eventSeries.id, seriesId), isNull(eventSeries.deletedAt)),
  });

  if (!series) {
    return { ok: false, error: 'Event series not found', code: 'NOT_FOUND' };
  }

  // Check slug uniqueness within series
  const existing = await db.query.eventEditions.findFirst({
    where: and(
      eq(eventEditions.seriesId, seriesId),
      eq(eventEditions.slug, slug),
      isNull(eventEditions.deletedAt),
    ),
  });

  if (existing) {
    return { ok: false, error: 'Edition slug is already taken in this series', code: 'SLUG_TAKEN' };
  }

  // Generate unique public code
  let publicCode = generatePublicCode();
  let attempts = 0;
  while (attempts < 10) {
    const codeExists = await db.query.eventEditions.findFirst({
      where: eq(eventEditions.publicCode, publicCode),
    });
    if (!codeExists) break;
    publicCode = generatePublicCode();
    attempts++;
  }

  // Create the edition and audit log in a transaction (Phase 0 requirement)
  const requestContext = await getRequestContext(await headers());
  const edition = await db.transaction(async (tx) => {
    const [newEdition] = await tx
      .insert(eventEditions)
      .values({
        seriesId,
        editionLabel,
        publicCode,
        slug,
        visibility: 'draft',
        timezone,
        startsAt: startsAt ? new Date(startsAt) : undefined,
        endsAt: endsAt ? new Date(endsAt) : undefined,
        locationDisplay,
        city,
        state,
        country,
        externalUrl,
      })
      .returning();

    // Write audit log in same transaction (ensures atomicity)
    const auditResult = await createAuditLog(
      {
        organizationId: series.organizationId,
        actorUserId: authContext.user.id,
        action: 'event.create',
        entityType: 'event_edition',
        entityId: newEdition.id,
        after: { editionLabel, slug, publicCode, visibility: 'draft' },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }

    return newEdition;
  });

  return {
    ok: true,
    data: {
      id: edition.id,
      publicCode: edition.publicCode,
      editionLabel: edition.editionLabel,
      slug: edition.slug,
      visibility: edition.visibility,
      seriesId: edition.seriesId,
    },
  };
});

/**
 * Update an event edition.
 * Requires edit permission in the organization.
 */
export const updateEventEdition = withAuthenticatedUser<ActionResult<EventEditionData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateEventEditionSchema>) => {
  // Phase 0 gate: check global organizer permission + feature flag
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = updateEventEditionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, ...updates } = validated.data;

  // Get edition and check permissions
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  // Internal staff with canManageEvents can access all orgs for support
  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, edition.series.organizationId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Check slug uniqueness if changing
  if (updates.slug && updates.slug !== edition.slug) {
    const existing = await db.query.eventEditions.findFirst({
      where: and(
        eq(eventEditions.seriesId, edition.seriesId),
        eq(eventEditions.slug, updates.slug),
        isNull(eventEditions.deletedAt),
      ),
    });
    if (existing) {
      return { ok: false, error: 'Edition slug is already taken in this series', code: 'SLUG_TAKEN' };
    }
  }

  // Build update object
  const updateData: Record<string, unknown> = {};
  if (updates.editionLabel !== undefined) updateData.editionLabel = updates.editionLabel;
  if (updates.slug !== undefined) updateData.slug = updates.slug;
  if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
  if (updates.startsAt !== undefined) updateData.startsAt = updates.startsAt ? new Date(updates.startsAt) : null;
  if (updates.endsAt !== undefined) updateData.endsAt = updates.endsAt ? new Date(updates.endsAt) : null;
  if (updates.registrationOpensAt !== undefined) updateData.registrationOpensAt = updates.registrationOpensAt ? new Date(updates.registrationOpensAt) : null;
  if (updates.registrationClosesAt !== undefined) updateData.registrationClosesAt = updates.registrationClosesAt ? new Date(updates.registrationClosesAt) : null;
  if (updates.locationDisplay !== undefined) updateData.locationDisplay = updates.locationDisplay;
  if (updates.address !== undefined) updateData.address = updates.address;
  if (updates.city !== undefined) updateData.city = updates.city;
  if (updates.state !== undefined) updateData.state = updates.state;
  if (updates.country !== undefined) updateData.country = updates.country;
  if (updates.externalUrl !== undefined) updateData.externalUrl = updates.externalUrl;

  // Update edition and audit log in a transaction (Phase 0 requirement)
  const requestContext = await getRequestContext(await headers());
  const updated = await db.transaction(async (tx) => {
    const [updatedEdition] = await tx
      .update(eventEditions)
      .set(updateData)
      .where(eq(eventEditions.id, editionId))
      .returning();

    // Write audit log in same transaction (ensures atomicity)
    const auditResult = await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'event.update',
        entityType: 'event_edition',
        entityId: editionId,
        before: { editionLabel: edition.editionLabel, slug: edition.slug },
        after: { editionLabel: updatedEdition.editionLabel, slug: updatedEdition.slug },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }

    return updatedEdition;
  });

  return {
    ok: true,
    data: {
      id: updated.id,
      publicCode: updated.publicCode,
      editionLabel: updated.editionLabel,
      slug: updated.slug,
      visibility: updated.visibility,
      seriesId: updated.seriesId,
    },
  };
});

/**
 * Update event visibility (publish/unpublish/archive).
 * Requires publish permission for publish/unpublish/archive.
 */
export const updateEventVisibility = withAuthenticatedUser<ActionResult<{ visibility: string }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateEventVisibilitySchema>) => {
  // Phase 0 gate: check global organizer permission + feature flag
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = updateEventVisibilitySchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, visibility } = validated.data;

  // Get edition and check permissions
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  // Internal staff with canManageEvents can access all orgs for support
  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, edition.series.organizationId);
    try {
      requireOrgPermission(membership, 'canPublishEvents');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const previousVisibility = edition.visibility;

  // Determine audit action based on visibility transition
  let action: 'event.publish' | 'event.unpublish' | 'event.archive' | 'event.update';
  if (visibility === 'published' && previousVisibility !== 'published') {
    action = 'event.publish';
  } else if (visibility === 'archived') {
    action = 'event.archive';
  } else if (previousVisibility === 'published' && visibility !== 'published') {
    action = 'event.unpublish';
  } else {
    // Covers transitions like draft→unlisted, unlisted→draft, etc.
    action = 'event.update';
  }

  // Update visibility and audit log in a transaction (Phase 0 requirement)
  const requestContext = await getRequestContext(await headers());
  await db.transaction(async (tx) => {
    await tx
      .update(eventEditions)
      .set({ visibility })
      .where(eq(eventEditions.id, editionId));

    // Write audit log in same transaction (ensures atomicity)
    const auditResult = await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action,
        entityType: 'event_edition',
        entityId: editionId,
        before: { visibility: previousVisibility },
        after: { visibility },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }
  });

  return { ok: true, data: { visibility } };
});

/**
 * Pause or resume registration for an event.
 * Requires edit permission.
 */
export const setRegistrationPaused = withAuthenticatedUser<ActionResult<{ paused: boolean }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof pauseRegistrationSchema>) => {
  // Phase 0 gate: check global organizer permission + feature flag
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = pauseRegistrationSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, paused } = validated.data;

  // Get edition and check permissions
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  // Internal staff with canManageEvents can access all orgs for support
  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, edition.series.organizationId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Update pause state and audit log in a transaction (Phase 0 requirement)
  const requestContext = await getRequestContext(await headers());
  await db.transaction(async (tx) => {
    await tx
      .update(eventEditions)
      .set({ isRegistrationPaused: paused })
      .where(eq(eventEditions.id, editionId));

    // Write audit log in same transaction (ensures atomicity)
    const auditResult = await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: paused ? 'event.pause_registration' : 'event.resume_registration',
        entityType: 'event_edition',
        entityId: editionId,
        before: { isRegistrationPaused: edition.isRegistrationPaused },
        after: { isRegistrationPaused: paused },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }
  });

  return { ok: true, data: { paused } };
});

/**
 * Check if a slug is available for a series or edition.
 */
export const checkSlugAvailability = withAuthenticatedUser<ActionResult<{ available: boolean }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof checkSlugAvailabilitySchema>) => {
  // Phase 0 gate: check global organizer permission + feature flag
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = checkSlugAvailabilitySchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { organizationId, seriesId, slug } = validated.data;

  // Check for series slug within organization
  if (organizationId) {
    // Authorization: require membership in the org (or internal override via canManageEvents)
    if (!authContext.permissions.canManageEvents) {
      const membership = await getOrgMembership(authContext.user.id, organizationId);
      if (!membership) {
        return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
      }
    }

    const existing = await db.query.eventSeries.findFirst({
      where: and(
        eq(eventSeries.organizationId, organizationId),
        eq(eventSeries.slug, slug),
        isNull(eventSeries.deletedAt),
      ),
    });
    return { ok: true, data: { available: !existing } };
  }

  // Check for edition slug within series
  if (seriesId) {
    // Authorization: require membership in the series' org (or internal override via canManageEvents)
    if (!authContext.permissions.canManageEvents) {
      const membership = await canUserAccessSeries(authContext.user.id, seriesId);
      if (!membership) {
        return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
      }
    }

    const existing = await db.query.eventEditions.findFirst({
      where: and(
        eq(eventEditions.seriesId, seriesId),
        eq(eventEditions.slug, slug),
        isNull(eventEditions.deletedAt),
      ),
    });
    return { ok: true, data: { available: !existing } };
  }

  return { ok: false, error: 'Either organizationId or seriesId is required', code: 'VALIDATION_ERROR' };
});
