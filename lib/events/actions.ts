'use server';

import { customAlphabet } from 'nanoid';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  eventFaqItems,
  eventPolicyConfigs,
  eventSeries,
  media,
  pricingTiers,
  registrants,
  registrations,
  waiverAcceptances,
  waivers,
} from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import type { AuthContext } from '@/lib/auth/server';
import { isEventsEnabled, isEventsNoPaymentMode } from '@/lib/features/flags';
import {
  canUserAccessSeries,
  getOrgMembership,
  requireOrgPermission,
} from '@/lib/organizations/permissions';

import {
  CAPACITY_SCOPES,
  DISTANCE_KINDS,
  DISTANCE_UNITS,
  EVENT_VISIBILITY,
  SIGNATURE_TYPES,
  SPORT_TYPES,
  TERRAIN_TYPES,
} from './constants';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a unique public code for an event edition.
 * Format: 6 uppercase alphanumeric characters (e.g., "ABC123")
 */
const generatePublicCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

const STARTED_TTL_MINUTES = Number(process.env.EVENTS_REGISTRATION_STARTED_TTL_MINUTES ?? '30');
const SUBMITTED_TTL_MINUTES = Number(process.env.EVENTS_REGISTRATION_SUBMITTED_TTL_MINUTES ?? '30');
const PAYMENT_PENDING_TTL_HOURS = Number(process.env.EVENTS_REGISTRATION_PAYMENT_PENDING_TTL_HOURS ?? '24');

const resolveTtl = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

const STARTED_TTL_MINUTES_RESOLVED = resolveTtl(STARTED_TTL_MINUTES, 30);
const SUBMITTED_TTL_MINUTES_RESOLVED = resolveTtl(SUBMITTED_TTL_MINUTES, 30);
const PAYMENT_PENDING_TTL_HOURS_RESOLVED = resolveTtl(PAYMENT_PENDING_TTL_HOURS, 24);

function computeExpiresAt(
  now: Date,
  status: 'started' | 'submitted' | 'payment_pending',
): Date {
  switch (status) {
    case 'started':
      return new Date(now.getTime() + STARTED_TTL_MINUTES_RESOLVED * 60 * 1000);
    case 'submitted':
      return new Date(now.getTime() + SUBMITTED_TTL_MINUTES_RESOLVED * 60 * 1000);
    case 'payment_pending':
      return new Date(now.getTime() + PAYMENT_PENDING_TTL_HOURS_RESOLVED * 60 * 60 * 1000);
  }

  throw new Error(`Unsupported registration status: ${status}`);
}

function isExpiredHold(status: string, expiresAt: Date | null, now: Date): boolean {
  if (status === 'cancelled') {
    return true;
  }

  if (status === 'confirmed') {
    return false;
  }

  if (status === 'started' || status === 'submitted' || status === 'payment_pending') {
    return expiresAt === null || expiresAt <= now;
  }

  return true;
}

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
  latitude: z.string().regex(/^-?\d+(\.\d+)?$/).optional().nullable(),
  longitude: z.string().regex(/^-?\d+(\.\d+)?$/).optional().nullable(),
  externalUrl: z.string().url().max(500).optional(),
  description: z.string().max(5000).optional(),
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
  latitude: z.string().regex(/^-?\d+(\.\d+)?$/).optional().nullable(),
  longitude: z.string().regex(/^-?\d+(\.\d+)?$/).optional().nullable(),
  externalUrl: z.string().url().max(500).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  heroImageMediaId: z.string().uuid().optional().nullable(),
});

const updateEventVisibilitySchema = z.object({
  editionId: z.string().uuid(),
  visibility: z.enum(EVENT_VISIBILITY),
});

const updateEventCapacitySchema = z
  .object({
    editionId: z.string().uuid(),
    capacityScope: z.enum(CAPACITY_SCOPES),
    sharedCapacity: z.number().int().positive().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.capacityScope === 'shared_pool' && !data.sharedCapacity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shared capacity is required for shared pool mode',
        path: ['sharedCapacity'],
      });
    }
    if (data.capacityScope === 'per_distance' && data.sharedCapacity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shared capacity must be empty for per-distance mode',
        path: ['sharedCapacity'],
      });
    }
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

const updateEventPolicySchema = z.object({
  editionId: z.string().uuid(),
  refundsAllowed: z.boolean(),
  refundPolicyText: z.string().max(5000).optional().nullable(),
  refundDeadline: z.string().datetime().optional().nullable(),
  transfersAllowed: z.boolean(),
  transferPolicyText: z.string().max(5000).optional().nullable(),
  transferDeadline: z.string().datetime().optional().nullable(),
  deferralsAllowed: z.boolean(),
  deferralPolicyText: z.string().max(5000).optional().nullable(),
  deferralDeadline: z.string().datetime().optional().nullable(),
});

const confirmEventMediaUploadSchema = z.object({
  organizationId: z.string().uuid(),
  blobUrl: z.string().url(),
  kind: z.enum(['image', 'pdf', 'document']).optional(),
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

type EventCapacityData = {
  capacityScope: (typeof CAPACITY_SCOPES)[number];
  sharedCapacity: number | null;
};

type EventPolicyConfigData = {
  refundsAllowed: boolean;
  refundPolicyText: string | null;
  refundDeadline: string | null;
  transfersAllowed: boolean;
  transferPolicyText: string | null;
  transferDeadline: string | null;
  deferralsAllowed: boolean;
  deferralPolicyText: string | null;
  deferralDeadline: string | null;
};

type ConfirmEventMediaUploadData = {
  mediaId: string;
  blobUrl: string;
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

  const {
    seriesId,
    editionLabel,
    slug,
    startsAt,
    endsAt,
    timezone,
    locationDisplay,
    city,
    state,
    country,
    latitude,
    longitude,
    externalUrl,
    description,
  } = validated.data;

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
        latitude,
        longitude,
        externalUrl,
        description: description || undefined,
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

  if (updates.heroImageMediaId !== undefined && updates.heroImageMediaId !== null) {
    const heroImage = await db.query.media.findFirst({
      where: and(
        eq(media.id, updates.heroImageMediaId),
        eq(media.organizationId, edition.series.organizationId),
        isNull(media.deletedAt),
      ),
    });

    if (!heroImage) {
      return { ok: false, error: 'Invalid hero image selection', code: 'VALIDATION_ERROR' };
    }

    if (heroImage.kind !== 'image') {
      await db.update(media).set({ kind: 'image' }).where(eq(media.id, heroImage.id));
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
  if (updates.latitude !== undefined) updateData.latitude = updates.latitude;
  if (updates.longitude !== undefined) updateData.longitude = updates.longitude;
  if (updates.externalUrl !== undefined) updateData.externalUrl = updates.externalUrl;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.heroImageMediaId !== undefined) updateData.heroImageMediaId = updates.heroImageMediaId;

  // Guard: reject empty updates to prevent invalid SQL
  if (Object.keys(updateData).length === 0) {
    return { ok: false, error: 'No fields to update', code: 'VALIDATION_ERROR' };
  }

  // Update edition and audit log in a transaction (Phase 0 requirement)
  const requestContext = await getRequestContext(await headers());
  const updated = await db.transaction(async (tx) => {
    const [updatedEdition] = await tx
      .update(eventEditions)
      .set(updateData)
      .where(eq(eventEditions.id, editionId))
      .returning();

    // Build comprehensive before/after for audit log
    const auditBefore: Record<string, unknown> = {};
    const auditAfter: Record<string, unknown> = {};
    for (const key of Object.keys(updateData)) {
      auditBefore[key] = (edition as never)[key];
      auditAfter[key] = (updatedEdition as never)[key];
    }

    // Write audit log in same transaction (ensures atomicity)
    const auditResult = await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'event.update',
        entityType: 'event_edition',
        entityId: editionId,
        before: auditBefore,
        after: auditAfter,
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
 * Update event capacity settings (shared pool vs per-distance).
 * Requires edit permission in the organization.
 */
export const updateEventCapacitySettings = withAuthenticatedUser<ActionResult<EventCapacityData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateEventCapacitySchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = updateEventCapacitySchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, capacityScope, sharedCapacity } = validated.data;

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

  const nextSharedCapacity = capacityScope === 'shared_pool' ? sharedCapacity ?? null : null;
  const previousScope = edition.sharedCapacity ? 'shared_pool' : 'per_distance';
  const requestContext = await getRequestContext(await headers());

  await db.transaction(async (tx) => {
    const [updatedEdition] = await tx
      .update(eventEditions)
      .set({ sharedCapacity: nextSharedCapacity })
      .where(eq(eventEditions.id, editionId))
      .returning();

    await tx
      .update(eventDistances)
      .set({ capacityScope })
      .where(
        and(
          eq(eventDistances.editionId, editionId),
          isNull(eventDistances.deletedAt),
        ),
      );

    const auditResult = await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'event.update',
        entityType: 'event_edition',
        entityId: editionId,
        before: {
          sharedCapacity: edition.sharedCapacity,
          capacityScope: previousScope,
        },
        after: {
          sharedCapacity: updatedEdition.sharedCapacity,
          capacityScope,
        },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }
  });

  return { ok: true, data: { capacityScope, sharedCapacity: nextSharedCapacity } };
});

/**
 * Update event policy placeholders (refund/transfer/deferral).
 * Requires edit permission in the organization.
 */
export const updateEventPolicyConfig = withAuthenticatedUser<ActionResult<EventPolicyConfigData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateEventPolicySchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = updateEventPolicySchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const data = validated.data;

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, data.editionId), isNull(eventEditions.deletedAt)),
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

  const normalizeText = (value: string | null | undefined) => value?.trim() || null;
  const payload = {
    refundsAllowed: data.refundsAllowed,
    refundPolicyText: normalizeText(data.refundPolicyText),
    refundDeadline: data.refundDeadline ? new Date(data.refundDeadline) : null,
    transfersAllowed: data.transfersAllowed,
    transferPolicyText: normalizeText(data.transferPolicyText),
    transferDeadline: data.transferDeadline ? new Date(data.transferDeadline) : null,
    deferralsAllowed: data.deferralsAllowed,
    deferralPolicyText: normalizeText(data.deferralPolicyText),
    deferralDeadline: data.deferralDeadline ? new Date(data.deferralDeadline) : null,
  };

  const requestContext = await getRequestContext(await headers());
  const existing = await db.query.eventPolicyConfigs.findFirst({
    where: eq(eventPolicyConfigs.editionId, data.editionId),
  });

  const updated = await db.transaction(async (tx) => {
    const [record] = existing
      ? await tx
          .update(eventPolicyConfigs)
          .set(payload)
          .where(eq(eventPolicyConfigs.editionId, data.editionId))
          .returning()
      : await tx
          .insert(eventPolicyConfigs)
          .values({ editionId: data.editionId, ...payload })
          .returning();

    const auditResult = await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'policy.update',
        entityType: 'event_policy_config',
        entityId: record.id,
        before: existing ?? undefined,
        after: record,
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }

    return record;
  });

  return {
    ok: true,
    data: {
      refundsAllowed: updated.refundsAllowed,
      refundPolicyText: updated.refundPolicyText,
      refundDeadline: updated.refundDeadline ? updated.refundDeadline.toISOString() : null,
      transfersAllowed: updated.transfersAllowed,
      transferPolicyText: updated.transferPolicyText,
      transferDeadline: updated.transferDeadline ? updated.transferDeadline.toISOString() : null,
      deferralsAllowed: updated.deferralsAllowed,
      deferralPolicyText: updated.deferralPolicyText,
      deferralDeadline: updated.deferralDeadline ? updated.deferralDeadline.toISOString() : null,
    },
  };
});

/**
 * Confirm an event media upload by looking up the media record and returning its ID.
 * Requires edit permission in the organization.
 */
export const confirmEventMediaUpload = withAuthenticatedUser<ActionResult<ConfirmEventMediaUploadData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof confirmEventMediaUploadSchema>) => {
  // Phase 0 gate: check global organizer permission + feature flag
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = confirmEventMediaUploadSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { organizationId, blobUrl, kind } = validated.data;
  const expectedKind = kind ?? 'document';

  if (!blobUrl.includes('vercel-storage.com') && !blobUrl.includes('blob.vercel-storage.com')) {
    return { ok: false, error: 'Invalid media URL', code: 'VALIDATION_ERROR' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, organizationId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const MAX_MEDIA_LOOKUP_ATTEMPTS = 3;
  let uploadedMedia: typeof media.$inferSelect | null = null;

  for (let attempt = 0; attempt < MAX_MEDIA_LOOKUP_ATTEMPTS; attempt += 1) {
    uploadedMedia = (await db.query.media.findFirst({
      where: and(
        eq(media.organizationId, organizationId),
        eq(media.blobUrl, blobUrl),
        isNull(media.deletedAt),
      ),
    })) ?? null;

    if (uploadedMedia) break;

    if (attempt < MAX_MEDIA_LOOKUP_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }

  if (!uploadedMedia) {
    const requestContext = await getRequestContext(await headers());
    const [created] = await db
      .insert(media)
      .values({
        organizationId,
        blobUrl,
        kind: expectedKind,
        mimeType: null,
        sizeBytes: null,
      })
      .returning();

    if (!created) {
      return { ok: false, error: 'Failed to create media record', code: 'SERVER_ERROR' };
    }

    const auditResult = await createAuditLog(
      {
        organizationId,
        actorUserId: authContext.user.id,
        action: 'media.upload',
        entityType: 'media',
        entityId: created.id,
        after: {
          blobUrl: created.blobUrl,
          kind: created.kind,
          mimeType: created.mimeType,
          sizeBytes: created.sizeBytes,
          source: 'confirm',
        },
        request: requestContext,
      },
    );

    if (!auditResult.ok) {
      return { ok: false, error: 'Failed to create audit log', code: 'SERVER_ERROR' };
    }

    return { ok: true, data: { mediaId: created.id, blobUrl: created.blobUrl } };
  }

  if (uploadedMedia.kind !== expectedKind) {
    await db
      .update(media)
      .set({ kind: expectedKind })
      .where(eq(media.id, uploadedMedia.id));
  }

  return { ok: true, data: { mediaId: uploadedMedia.id, blobUrl: uploadedMedia.blobUrl } };
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

  if (visibility === 'published' && previousVisibility !== 'published') {
    const distances = await db.query.eventDistances.findMany({
      where: and(eq(eventDistances.editionId, editionId), isNull(eventDistances.deletedAt)),
      with: {
        pricingTiers: {
          where: isNull(pricingTiers.deletedAt),
          limit: 1,
        },
      },
    });

    if (distances.length === 0) {
      return { ok: false, error: 'Event must have at least one distance', code: 'MISSING_DISTANCE' };
    }

    const hasMissingPrices = distances.some((distance) => distance.pricingTiers.length === 0);
    if (hasMissingPrices) {
      return { ok: false, error: 'Each distance must have at least one price', code: 'MISSING_PRICING' };
    }
  }

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

// =============================================================================
// Distance Actions
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

  return { ok: true, data: undefined };
});

/**
 * Update distance price (v1: single price).
 */
const updateDistancePriceSchema = z.object({
  distanceId: z.string().uuid(),
  priceCents: z.number().int().nonnegative(),
});

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

  return { ok: true, data: undefined };
});

// =============================================================================
// FAQ Actions
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

type FaqItemData = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  editionId: string;
};

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

    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_ITEM_IDS') {
      return { ok: false, error: 'One or more FAQ items do not belong to this edition', code: 'INVALID_INPUT' };
    }
    throw error;
  }
});

// =============================================================================
// Waiver Actions
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

type WaiverData = {
  id: string;
  title: string;
  body: string;
  versionHash: string;
  signatureType: string;
  displayOrder: number;
  editionId: string;
};

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

  return { ok: true, data: undefined };
});

// =============================================================================
// Registration Actions
// =============================================================================

const startRegistrationSchema = z.object({
  distanceId: z.string().uuid(),
});

const submitRegistrantInfoSchema = z.object({
  registrationId: z.string().uuid(),
  profileSnapshot: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email(),
    dateOfBirth: z.string(), // ISO date string
    gender: z.string().optional(),
    phone: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
  }),
  division: z.string().optional(),
  genderIdentity: z.string().optional(),
});

const acceptWaiverSchema = z
  .object({
    registrationId: z.string().uuid(),
    waiverId: z.string().uuid(),
    signatureType: z.enum(SIGNATURE_TYPES),
    signatureValue: z.string().optional(),
  })
  .refine(
    data => {
      // If signatureType is 'initials' or 'signature', signatureValue must be provided
      if (data.signatureType === 'initials' || data.signatureType === 'signature') {
        return data.signatureValue && data.signatureValue.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Signature value is required for initials and signature types',
      path: ['signatureValue'],
    },
  );

const finalizeRegistrationSchema = z.object({
  registrationId: z.string().uuid(),
});

type RegistrationData = {
  id: string;
  status: string;
  distanceId: string;
  editionId: string;
  totalCents: number | null;
};

/**
 * Start a new registration.
 */
export const startRegistration = withAuthenticatedUser<ActionResult<RegistrationData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof startRegistrationSchema>) => {
  const validated = startRegistrationSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { distanceId } = validated.data;

  // Get distance with edition and check registration availability
  const distance = await db.query.eventDistances.findFirst({
    where: and(eq(eventDistances.id, distanceId), isNull(eventDistances.deletedAt)),
    with: {
      edition: { with: { series: true } },
      pricingTiers: { where: isNull(pricingTiers.deletedAt) },
    },
  });

  if (!distance?.edition?.series) {
    return { ok: false, error: 'Distance not found', code: 'NOT_FOUND' };
  }

  const edition = distance.edition;

  // Check registration is open
  if (edition.visibility !== 'published') {
    return { ok: false, error: 'Event is not published', code: 'NOT_PUBLISHED' };
  }

  if (edition.isRegistrationPaused) {
    return { ok: false, error: 'Registration is paused', code: 'REGISTRATION_PAUSED' };
  }

  const now = new Date();
  if (edition.registrationOpensAt && now < edition.registrationOpensAt) {
    return { ok: false, error: 'Registration has not opened yet', code: 'REGISTRATION_NOT_OPEN' };
  }

  if (edition.registrationClosesAt && now > edition.registrationClosesAt) {
    return { ok: false, error: 'Registration has closed', code: 'REGISTRATION_CLOSED' };
  }

  // Get price (before transaction so we can fail fast)
  const activeTier = distance.pricingTiers
    .filter(t => {
      if (t.startsAt && now < t.startsAt) return false;
      if (t.endsAt && now > t.endsAt) return false;
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];

  const priceCents = activeTier?.priceCents ?? 0;
  const feesCents = Math.round(priceCents * 0.05); // 5% platform fee placeholder
  const totalCents = priceCents + feesCents;

  // Start registration within transaction to ensure atomicity of anti-squatting + capacity checks
  try {
    const registration = await db.transaction(async (tx) => {
      const now = new Date();

      // Lock the distance row to serialize all checks per distance
      // This lock applies even when capacity is null to ensure anti-squatting atomicity
      await tx.execute(sql`SELECT id FROM ${eventDistances} WHERE id = ${distanceId} FOR UPDATE`);

      // Anti-squatting: Check for existing active registration by this user for this distance
      // Now atomic - concurrent requests will serialize due to the distance lock above
      const existingRegistration = await tx.query.registrations.findFirst({
        where: and(
          eq(registrations.buyerUserId, authContext.user.id),
          eq(registrations.distanceId, distanceId),
          or(
            eq(registrations.status, 'started'),
            eq(registrations.status, 'submitted'),
            eq(registrations.status, 'payment_pending'),
          ),
          gt(registrations.expiresAt, now),
          isNull(registrations.deletedAt),
        ),
      });

      // If existing active registration found, return it (idempotent)
      if (existingRegistration) {
        return existingRegistration;
      }

      // Check capacity with locked distance row (or shared pool on edition)
      if (distance.capacityScope === 'shared_pool' && distance.edition.sharedCapacity) {
        await tx.execute(sql`SELECT id FROM ${eventEditions} WHERE id = ${edition.id} FOR UPDATE`);

        const reservedCount = await tx.query.registrations.findMany({
          where: and(
            eq(registrations.editionId, edition.id),
            or(
              eq(registrations.status, 'confirmed'),
              and(
                or(
                  eq(registrations.status, 'started'),
                  eq(registrations.status, 'submitted'),
                  eq(registrations.status, 'payment_pending'),
                ),
                gt(registrations.expiresAt, now),
              ),
            ),
            isNull(registrations.deletedAt),
          ),
        });

        if (reservedCount.length >= distance.edition.sharedCapacity) {
          throw new Error('SOLD_OUT');
        }
      } else if (distance.capacity) {
        const reservedCount = await tx.query.registrations.findMany({
          where: and(
            eq(registrations.distanceId, distanceId),
            or(
              eq(registrations.status, 'confirmed'),
              and(
                or(
                  eq(registrations.status, 'started'),
                  eq(registrations.status, 'submitted'),
                  eq(registrations.status, 'payment_pending'),
                ),
                gt(registrations.expiresAt, now),
              ),
            ),
            isNull(registrations.deletedAt),
          ),
        });
        if (reservedCount.length >= distance.capacity) {
          throw new Error('SOLD_OUT');
        }
      }

      // Create new registration
      const [newReg] = await tx
        .insert(registrations)
        .values({
          editionId: edition.id,
          distanceId,
          buyerUserId: authContext.user.id,
          status: 'started',
          basePriceCents: priceCents,
          feesCents,
          taxCents: 0,
          totalCents,
          expiresAt: computeExpiresAt(now, 'started'),
        })
        .returning();

      return newReg;
    });

    return {
      ok: true,
      data: {
        id: registration.id,
        status: registration.status,
        distanceId: registration.distanceId,
        editionId: registration.editionId,
        totalCents: registration.totalCents,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'SOLD_OUT') {
      return { ok: false, error: 'Distance is sold out', code: 'SOLD_OUT' };
    }
    throw error;
  }
});

/**
 * Submit registrant info.
 */
export const submitRegistrantInfo = withAuthenticatedUser<ActionResult<RegistrationData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof submitRegistrantInfoSchema>) => {
  const validated = submitRegistrantInfoSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { registrationId, profileSnapshot, division, genderIdentity } = validated.data;

  const registration = await db.query.registrations.findFirst({
    where: and(
      eq(registrations.id, registrationId),
      eq(registrations.buyerUserId, authContext.user.id),
      isNull(registrations.deletedAt),
    ),
  });

  if (!registration) {
    return { ok: false, error: 'Registration not found', code: 'NOT_FOUND' };
  }

  const now = new Date();
  if (isExpiredHold(registration.status, registration.expiresAt, now)) {
    return {
      ok: false,
      error: 'Registration expired. Please start again.',
      code: 'REGISTRATION_EXPIRED',
    };
  }

  if (registration.status !== 'started') {
    return { ok: false, error: 'Registration has already been submitted', code: 'ALREADY_SUBMITTED' };
  }

  try {
    const updatedRegistration = await db.transaction(async (tx) => {
      // Create or update registrant
      const existingRegistrant = await tx.query.registrants.findFirst({
        where: eq(registrants.registrationId, registrationId),
      });

      if (existingRegistrant) {
        await tx
          .update(registrants)
          .set({
            profileSnapshot,
            division,
            genderIdentity,
            userId: authContext.user.id,
          })
          .where(eq(registrants.id, existingRegistrant.id));
      } else {
        await tx.insert(registrants).values({
          registrationId,
          userId: authContext.user.id,
          profileSnapshot,
          division,
          genderIdentity,
        });
      }

      const [updated] = await tx
        .update(registrations)
        .set({
          status: 'submitted',
          expiresAt: computeExpiresAt(now, 'submitted'),
        })
        .where(
          and(
            eq(registrations.id, registrationId),
            eq(registrations.status, 'started'),
          ),
        )
        .returning();

      if (!updated) {
        throw new Error('INVALID_STATE_TRANSITION');
      }

      return updated;
    });

    return {
      ok: true,
      data: {
        id: updatedRegistration.id,
        status: updatedRegistration.status,
        distanceId: updatedRegistration.distanceId,
        editionId: updatedRegistration.editionId,
        totalCents: updatedRegistration.totalCents,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_STATE_TRANSITION') {
      return { ok: false, error: 'Registration cannot be submitted from current state', code: 'INVALID_STATE' };
    }
    throw error;
  }
});

/**
 * Accept a waiver.
 */
export const acceptWaiver = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof acceptWaiverSchema>) => {
  const validated = acceptWaiverSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { registrationId, waiverId, signatureType, signatureValue } = validated.data;

  const registration = await db.query.registrations.findFirst({
    where: and(
      eq(registrations.id, registrationId),
      eq(registrations.buyerUserId, authContext.user.id),
      isNull(registrations.deletedAt),
    ),
  });

  if (!registration) {
    return { ok: false, error: 'Registration not found', code: 'NOT_FOUND' };
  }

  const now = new Date();
  if (isExpiredHold(registration.status, registration.expiresAt, now)) {
    return {
      ok: false,
      error: 'Registration expired. Please start again.',
      code: 'REGISTRATION_EXPIRED',
    };
  }

  const waiver = await db.query.waivers.findFirst({
    where: and(
      eq(waivers.id, waiverId),
      eq(waivers.editionId, registration.editionId),
      isNull(waivers.deletedAt),
    ),
  });

  if (!waiver) {
    return { ok: false, error: 'Waiver not found', code: 'NOT_FOUND' };
  }

  if (waiver.signatureType !== signatureType) {
    return { ok: false, error: 'Signature type mismatch', code: 'VALIDATION_ERROR' };
  }

  const normalizedSignatureValue =
    signatureType === 'checkbox' ? null : signatureValue?.trim() || null;

  const existingAcceptance = await db.query.waiverAcceptances.findFirst({
    where: and(
      eq(waiverAcceptances.registrationId, registrationId),
      eq(waiverAcceptances.waiverId, waiverId),
    ),
  });

  if (existingAcceptance) {
    return { ok: true, data: undefined };
  }

  const headersList = await headers();
  const ipAddress = headersList.get('x-forwarded-for')?.split(',')[0] || headersList.get('x-real-ip') || null;
  const userAgent = headersList.get('user-agent');

  await db.insert(waiverAcceptances).values({
    registrationId,
    waiverId,
    waiverVersionHash: waiver.versionHash,
    acceptedAt: new Date(),
    ipAddress,
    userAgent,
    signatureType,
    signatureValue: normalizedSignatureValue,
  });

  return { ok: true, data: undefined };
});

/**
 * Finalize registration (moves to payment_pending or confirmed in no-payment mode).
 */
export const finalizeRegistration = withAuthenticatedUser<ActionResult<RegistrationData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof finalizeRegistrationSchema>) => {
  const validated = finalizeRegistrationSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { registrationId } = validated.data;

  const registration = await db.query.registrations.findFirst({
    where: and(
      eq(registrations.id, registrationId),
      eq(registrations.buyerUserId, authContext.user.id),
      isNull(registrations.deletedAt),
    ),
  });

  if (!registration) {
    return { ok: false, error: 'Registration not found', code: 'NOT_FOUND' };
  }

  const now = new Date();
  if (isExpiredHold(registration.status, registration.expiresAt, now)) {
    return {
      ok: false,
      error: 'Registration expired. Please start again.',
      code: 'REGISTRATION_EXPIRED',
    };
  }

  if (registration.status === 'confirmed') {
    return {
      ok: true,
      data: {
        id: registration.id,
        status: registration.status,
        distanceId: registration.distanceId,
        editionId: registration.editionId,
        totalCents: registration.totalCents,
      },
    };
  }

  const [registrationRegistrants, registrationWaivers, editionWaivers] = await Promise.all([
    db.query.registrants.findMany({
      where: eq(registrants.registrationId, registrationId),
    }),
    db.query.waiverAcceptances.findMany({
      where: eq(waiverAcceptances.registrationId, registrationId),
    }),
    db.query.waivers.findMany({
      where: and(
        eq(waivers.editionId, registration.editionId),
        isNull(waivers.deletedAt),
      ),
    }),
  ]);

  const distance = await db.query.eventDistances.findFirst({
    where: eq(eventDistances.id, registration.distanceId),
  });

  if (!distance) {
    return { ok: false, error: 'Distance not found', code: 'NOT_FOUND' };
  }

  // Validate registrant info exists
  if (!registrationRegistrants.length) {
    return { ok: false, error: 'Registrant info is required', code: 'MISSING_REGISTRANT' };
  }

  // Validate all waivers accepted
  const requiredWaivers = editionWaivers.map(w => w.id);
  const acceptedWaivers = registrationWaivers.map(a => a.waiverId);
  const missingWaivers = requiredWaivers.filter(w => !acceptedWaivers.includes(w));

  if (missingWaivers.length > 0) {
    return { ok: false, error: 'All waivers must be accepted', code: 'MISSING_WAIVER' };
  }

  // Re-validate event state and capacity before confirming
  try {
    const updated = await db.transaction(async (tx) => {
      const now = new Date();

      // Re-fetch current edition and distance state inside transaction for freshness
      const currentEdition = await tx.query.eventEditions.findFirst({
        where: eq(eventEditions.id, registration.editionId),
      });

      const currentDistance = await tx.query.eventDistances.findFirst({
        where: eq(eventDistances.id, registration.distanceId),
      });

      if (!currentEdition || !currentDistance) {
        throw new Error('EVENT_NOT_FOUND');
      }

      // Re-check event visibility and registration availability using fresh data
      if (currentEdition.visibility !== 'published') {
        throw new Error('EVENT_NOT_PUBLISHED');
      }

      if (currentEdition.isRegistrationPaused) {
        throw new Error('REGISTRATION_PAUSED');
      }

      if (currentEdition.registrationOpensAt && now < currentEdition.registrationOpensAt) {
        throw new Error('REGISTRATION_NOT_OPEN');
      }

      if (currentEdition.registrationClosesAt && now > currentEdition.registrationClosesAt) {
        throw new Error('REGISTRATION_CLOSED');
      }

      // Lock rows and re-check capacity transactionally
      if (currentDistance.capacityScope === 'shared_pool' && currentEdition.sharedCapacity) {
        await tx.execute(sql`SELECT id FROM ${eventEditions} WHERE id = ${registration.editionId} FOR UPDATE`);

        const reservedCount = await tx.query.registrations.findMany({
          where: and(
            eq(registrations.editionId, registration.editionId),
            or(
              eq(registrations.status, 'confirmed'),
              and(
                or(
                  eq(registrations.status, 'started'),
                  eq(registrations.status, 'submitted'),
                  eq(registrations.status, 'payment_pending'),
                ),
                gt(registrations.expiresAt, now),
              ),
            ),
            isNull(registrations.deletedAt),
            // Exclude the current registration from count
            sql`${registrations.id} != ${registrationId}`,
          ),
        });
        if (reservedCount.length >= currentEdition.sharedCapacity) {
          throw new Error('SOLD_OUT');
        }
      } else if (currentDistance.capacity) {
        // SELECT FOR UPDATE to serialize capacity checks per distance
        await tx.execute(sql`SELECT id FROM ${eventDistances} WHERE id = ${registration.distanceId} FOR UPDATE`);

        // Count with consistent reserved statuses (matching startRegistration)
        const reservedCount = await tx.query.registrations.findMany({
          where: and(
            eq(registrations.distanceId, registration.distanceId),
            or(
              eq(registrations.status, 'confirmed'),
              and(
                or(
                  eq(registrations.status, 'started'),
                  eq(registrations.status, 'submitted'),
                  eq(registrations.status, 'payment_pending'),
                ),
                gt(registrations.expiresAt, now),
              ),
            ),
            isNull(registrations.deletedAt),
            // Exclude the current registration from count
            sql`${registrations.id} != ${registrationId}`,
          ),
        });
        if (reservedCount.length >= currentDistance.capacity) {
          throw new Error('SOLD_OUT');
        }
      }

      const nextStatus = isEventsNoPaymentMode() ? 'confirmed' : 'payment_pending';
      const nextExpiresAt =
        nextStatus === 'confirmed' ? null : computeExpiresAt(now, 'payment_pending');

      // Move registration forward with guarded transition
      const [updatedReg] = await tx
        .update(registrations)
        .set({ status: nextStatus, expiresAt: nextExpiresAt })
        .where(
          and(
            eq(registrations.id, registrationId),
            // Only confirm if in expected prior state
            or(eq(registrations.status, 'started'), eq(registrations.status, 'submitted')),
          ),
        )
        .returning();

      if (!updatedReg) {
        throw new Error('INVALID_STATE_TRANSITION');
      }

      return updatedReg;
    });

    return {
      ok: true,
      data: {
        id: updated.id,
        status: updated.status,
        distanceId: updated.distanceId,
        editionId: updated.editionId,
        totalCents: updated.totalCents,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case 'EVENT_NOT_FOUND':
          return { ok: false, error: 'Event or distance not found', code: 'NOT_FOUND' };
        case 'EVENT_NOT_PUBLISHED':
          return { ok: false, error: 'Event is not published', code: 'NOT_PUBLISHED' };
        case 'REGISTRATION_PAUSED':
          return { ok: false, error: 'Registration is paused', code: 'REGISTRATION_PAUSED' };
        case 'REGISTRATION_NOT_OPEN':
          return { ok: false, error: 'Registration has not opened yet', code: 'REGISTRATION_NOT_OPEN' };
        case 'REGISTRATION_CLOSED':
          return { ok: false, error: 'Registration has closed', code: 'REGISTRATION_CLOSED' };
        case 'SOLD_OUT':
          return { ok: false, error: 'Distance is sold out', code: 'SOLD_OUT' };
        case 'INVALID_STATE_TRANSITION':
          return { ok: false, error: 'Registration cannot be finalized from current state', code: 'INVALID_STATE' };
      }
    }
    throw error;
  }
});
