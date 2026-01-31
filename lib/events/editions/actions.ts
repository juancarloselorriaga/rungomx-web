'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import {
  addOnOptions,
  addOns,
  discountCodes,
  eventDistances,
  eventEditions,
  eventFaqItems,
  eventPolicyConfigs,
  eventSeries,
  eventSlugRedirects,
  eventWebsiteContent,
  media,
  pricingTiers,
  registrationQuestions,
  waivers,
} from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { ProFeatureAccessError, requireProFeature } from '@/lib/pro-features/server/guard';
import { trackProFeatureEvent } from '@/lib/pro-features/server/tracking';
import {
  canUserAccessSeries,
  getOrgMembership,
  requireOrgPermission,
} from '@/lib/organizations/permissions';
import {
  eventEditionDetailTag,
  publicEventBySlugTag,
} from '../cache-tags';
import {
  CAPACITY_SCOPES,
  EVENT_VISIBILITY,
} from '../constants';
import {
  type ActionResult,
  checkEventsAccess,
  generatePublicCode,
  revalidatePublicEventByEditionId,
} from '../shared';

// =============================================================================
// Types
// =============================================================================

type CloneEditionResult = {
  editionId: string;
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
// Helpers
// =============================================================================

function parseYearLabel(label: string): number | null {
  const trimmed = label.trim();
  if (!/^\d{4}$/.test(trimmed)) return null;
  const year = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(year)) return null;
  return year;
}

function shiftDateByYears(value: Date | null, years: number): Date | null {
  if (!value) return null;
  if (years === 0) return value;
  const next = new Date(value);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

// =============================================================================
// Schemas
// =============================================================================

const cloneEditionSchema = z.object({
  sourceEditionId: z.string().uuid(),
  editionLabel: z.string().min(1).max(50),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
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
// Clone Edition Action
// =============================================================================

export const cloneEdition = withAuthenticatedUser<ActionResult<CloneEditionResult>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof cloneEditionSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = cloneEditionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { sourceEditionId, editionLabel, slug } = validated.data;

  const source = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, sourceEditionId), isNull(eventEditions.deletedAt)),
    with: {
      series: true,
      policyConfig: true,
      distances: {
        where: isNull(eventDistances.deletedAt),
        with: {
          pricingTiers: {
            where: isNull(pricingTiers.deletedAt),
          },
        },
      },
      websiteContent: {
        where: isNull(eventWebsiteContent.deletedAt),
      },
      faqItems: {
        where: isNull(eventFaqItems.deletedAt),
      },
      waivers: {
        where: isNull(waivers.deletedAt),
      },
      addOns: {
        where: isNull(addOns.deletedAt),
        with: {
          options: {
            where: isNull(addOnOptions.deletedAt),
          },
        },
      },
      discountCodes: {
        where: isNull(discountCodes.deletedAt),
      },
      registrationQuestions: {
        where: isNull(registrationQuestions.deletedAt),
      },
    },
  });

  if (!source?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, source.series.organizationId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  try {
    await requireProFeature('event_clone', authContext);
  } catch (error) {
    if (error instanceof ProFeatureAccessError) {
      return { ok: false, error: error.message, code: error.code };
    }
    throw error;
  }

  // Enforce uniqueness within series
  const [existingSlug, existingLabel] = await Promise.all([
    db.query.eventEditions.findFirst({
      where: and(
        eq(eventEditions.seriesId, source.seriesId),
        eq(eventEditions.slug, slug),
        isNull(eventEditions.deletedAt),
      ),
      columns: { id: true },
    }),
    db.query.eventEditions.findFirst({
      where: and(
        eq(eventEditions.seriesId, source.seriesId),
        eq(eventEditions.editionLabel, editionLabel),
        isNull(eventEditions.deletedAt),
      ),
      columns: { id: true },
    }),
  ]);

  if (existingSlug) {
    return { ok: false, error: 'Edition slug is already taken in this series', code: 'SLUG_TAKEN' };
  }

  if (existingLabel) {
    return { ok: false, error: 'Edition label is already used in this series', code: 'LABEL_TAKEN' };
  }

  const fromYear = parseYearLabel(source.editionLabel);
  const toYear = parseYearLabel(editionLabel);
  const yearShift = fromYear !== null && toYear !== null ? toYear - fromYear : 0;

  const requestContext = await getRequestContext(await headers());

  const created = await db.transaction(async (tx) => {
    // Generate unique public code
    let publicCode = generatePublicCode();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const exists = await tx.query.eventEditions.findFirst({
        where: eq(eventEditions.publicCode, publicCode),
        columns: { id: true },
      });
      if (!exists) break;
      publicCode = generatePublicCode();
    }

    const [newEdition] = await tx
      .insert(eventEditions)
      .values({
        seriesId: source.seriesId,
        editionLabel,
        publicCode,
        slug,
        visibility: 'draft',
        previousEditionId: source.id,
        clonedFromEditionId: source.id,
        startsAt: shiftDateByYears(source.startsAt, yearShift) ?? undefined,
        endsAt: shiftDateByYears(source.endsAt, yearShift) ?? undefined,
        timezone: source.timezone,
        registrationOpensAt: shiftDateByYears(source.registrationOpensAt, yearShift) ?? undefined,
        registrationClosesAt: shiftDateByYears(source.registrationClosesAt, yearShift) ?? undefined,
        isRegistrationPaused: false,
        sharedCapacity: source.sharedCapacity,
        locationDisplay: source.locationDisplay,
        address: source.address,
        city: source.city,
        state: source.state,
        country: source.country,
        latitude: source.latitude,
        longitude: source.longitude,
        externalUrl: source.externalUrl,
        heroImageMediaId: source.heroImageMediaId,
        description: source.description,
      })
      .returning();

    const distanceIdMap = new Map<string, string>();
    for (const distance of source.distances) {
      const [newDistance] = await tx
        .insert(eventDistances)
        .values({
          editionId: newEdition.id,
          label: distance.label,
          distanceValue: distance.distanceValue,
          distanceUnit: distance.distanceUnit,
          kind: distance.kind,
          startTimeLocal: shiftDateByYears(distance.startTimeLocal, yearShift) ?? undefined,
          timeLimitMinutes: distance.timeLimitMinutes,
          terrain: distance.terrain,
          isVirtual: distance.isVirtual,
          capacity: distance.capacity,
          capacityScope: distance.capacityScope,
          sortOrder: distance.sortOrder,
        })
        .returning();

      distanceIdMap.set(distance.id, newDistance.id);

      for (const tier of distance.pricingTiers) {
        await tx.insert(pricingTiers).values({
          distanceId: newDistance.id,
          label: tier.label,
          startsAt: shiftDateByYears(tier.startsAt, yearShift) ?? undefined,
          endsAt: shiftDateByYears(tier.endsAt, yearShift) ?? undefined,
          priceCents: tier.priceCents,
          currency: tier.currency,
          sortOrder: tier.sortOrder,
        });
      }
    }

    for (const content of source.websiteContent) {
      await tx.insert(eventWebsiteContent).values({
        editionId: newEdition.id,
        locale: content.locale,
        blocksJson: content.blocksJson,
      });
    }

    for (const faqItem of source.faqItems) {
      await tx.insert(eventFaqItems).values({
        editionId: newEdition.id,
        question: faqItem.question,
        answer: faqItem.answer,
        sortOrder: faqItem.sortOrder,
      });
    }

    for (const waiver of source.waivers) {
      await tx.insert(waivers).values({
        editionId: newEdition.id,
        title: waiver.title,
        body: waiver.body,
        versionHash: waiver.versionHash,
        signatureType: waiver.signatureType,
        displayOrder: waiver.displayOrder,
      });
    }

    if (source.policyConfig) {
      await tx.insert(eventPolicyConfigs).values({
        editionId: newEdition.id,
        refundsAllowed: source.policyConfig.refundsAllowed,
        refundPolicyText: source.policyConfig.refundPolicyText,
        refundDeadline: shiftDateByYears(source.policyConfig.refundDeadline, yearShift) ?? undefined,
        transfersAllowed: source.policyConfig.transfersAllowed,
        transferPolicyText: source.policyConfig.transferPolicyText,
        transferDeadline: shiftDateByYears(source.policyConfig.transferDeadline, yearShift) ?? undefined,
        deferralsAllowed: source.policyConfig.deferralsAllowed,
        deferralPolicyText: source.policyConfig.deferralPolicyText,
        deferralDeadline: shiftDateByYears(source.policyConfig.deferralDeadline, yearShift) ?? undefined,
      });
    }

    for (const addOn of source.addOns) {
      const mappedDistanceId = addOn.distanceId ? distanceIdMap.get(addOn.distanceId) : null;
      if (addOn.distanceId && !mappedDistanceId) continue;

      const [newAddOn] = await tx
        .insert(addOns)
        .values({
          editionId: newEdition.id,
          distanceId: mappedDistanceId,
          title: addOn.title,
          description: addOn.description,
          type: addOn.type,
          deliveryMethod: addOn.deliveryMethod,
          isActive: addOn.isActive,
          sortOrder: addOn.sortOrder,
        })
        .returning();

      for (const option of addOn.options) {
        await tx.insert(addOnOptions).values({
          addOnId: newAddOn.id,
          label: option.label,
          priceCents: option.priceCents,
          maxQtyPerOrder: option.maxQtyPerOrder,
          optionMeta: option.optionMeta,
          isActive: option.isActive,
          sortOrder: option.sortOrder,
        });
      }
    }

    for (const code of source.discountCodes) {
      await tx.insert(discountCodes).values({
        editionId: newEdition.id,
        code: code.code,
        name: code.name,
        percentOff: code.percentOff,
        maxRedemptions: code.maxRedemptions,
        startsAt: shiftDateByYears(code.startsAt, yearShift) ?? undefined,
        endsAt: shiftDateByYears(code.endsAt, yearShift) ?? undefined,
        isActive: code.isActive,
      });
    }

    for (const question of source.registrationQuestions) {
      const mappedDistanceId = question.distanceId ? distanceIdMap.get(question.distanceId) : null;
      if (question.distanceId && !mappedDistanceId) continue;

      await tx.insert(registrationQuestions).values({
        editionId: newEdition.id,
        distanceId: mappedDistanceId,
        type: question.type,
        prompt: question.prompt,
        helpText: question.helpText,
        isRequired: question.isRequired,
        options: question.options,
        sortOrder: question.sortOrder,
        isActive: question.isActive,
      });
    }

    const auditResult = await createAuditLog(
      {
        organizationId: source.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'event.clone',
        entityType: 'event_edition',
        entityId: newEdition.id,
        before: { sourceEditionId: source.id },
        after: { editionLabel, slug },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }

    return newEdition;
  });

  await trackProFeatureEvent({
    featureKey: 'event_clone',
    userId: authContext.user.id,
    eventType: 'used',
  });

  return { ok: true, data: { editionId: created.id } };
});

// =============================================================================
// Create Edition Action
// =============================================================================

/**
 * Create a new event edition within a series.
 * Requires edit permission in the organization.
 */
export const createEventEdition = withAuthenticatedUser<ActionResult<EventEditionData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createEventEditionSchema>) => {
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

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessSeries(authContext.user.id, seriesId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const series = await db.query.eventSeries.findFirst({
    where: and(eq(eventSeries.id, seriesId), isNull(eventSeries.deletedAt)),
  });

  if (!series) {
    return { ok: false, error: 'Event series not found', code: 'NOT_FOUND' };
  }

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

// =============================================================================
// Update Edition Action
// =============================================================================

/**
 * Update an event edition.
 * Requires edit permission in the organization.
 */
export const updateEventEdition = withAuthenticatedUser<ActionResult<EventEditionData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateEventEditionSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = updateEventEditionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, ...updates } = validated.data;

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

  const slugRedirectToCreate =
    updates.slug && updates.slug !== edition.slug
      ? {
          fromSeriesSlug: edition.series.slug,
          fromEditionSlug: edition.slug,
          toSeriesSlug: edition.series.slug,
          toEditionSlug: updates.slug,
          reason: 'edition_slug_change',
        }
      : null;

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

  if (Object.keys(updateData).length === 0) {
    return { ok: false, error: 'No fields to update', code: 'VALIDATION_ERROR' };
  }

  const requestContext = await getRequestContext(await headers());
  const updated = await db.transaction(async (tx) => {
    const [updatedEdition] = await tx
      .update(eventEditions)
      .set(updateData)
      .where(eq(eventEditions.id, editionId))
      .returning();

    if (slugRedirectToCreate) {
      await tx
        .insert(eventSlugRedirects)
        .values(slugRedirectToCreate)
        .onConflictDoNothing({
          target: [eventSlugRedirects.fromSeriesSlug, eventSlugRedirects.fromEditionSlug],
        });
    }

    const auditBefore: Record<string, unknown> = {};
    const auditAfter: Record<string, unknown> = {};
    for (const key of Object.keys(updateData)) {
      auditBefore[key] = (edition as never)[key];
      auditAfter[key] = (updatedEdition as never)[key];
    }

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

  revalidateTag(eventEditionDetailTag(updated.id), { expire: 0 });
  revalidateTag(publicEventBySlugTag(edition.series.slug, edition.slug), { expire: 0 });
  if (updated.slug !== edition.slug) {
    revalidateTag(publicEventBySlugTag(edition.series.slug, updated.slug), { expire: 0 });
  }

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

// =============================================================================
// Update Event Capacity Settings Action
// =============================================================================

/**
 * Update event capacity settings (shared pool vs per-distance).
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

  revalidateTag(eventEditionDetailTag(editionId), { expire: 0 });
  revalidateTag(publicEventBySlugTag(edition.series.slug, edition.slug), { expire: 0 });

  return { ok: true, data: { capacityScope, sharedCapacity: nextSharedCapacity } };
});

// =============================================================================
// Update Event Policy Config Action
// =============================================================================

/**
 * Update event policy config (refund/transfer/deferral).
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

  revalidateTag(eventEditionDetailTag(data.editionId), { expire: 0 });
  await revalidatePublicEventByEditionId(data.editionId);

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

// =============================================================================
// Confirm Event Media Upload Action
// =============================================================================

/**
 * Confirm an event media upload.
 */
export const confirmEventMediaUpload = withAuthenticatedUser<ActionResult<ConfirmEventMediaUploadData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof confirmEventMediaUploadSchema>) => {
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

// =============================================================================
// Update Event Visibility Action
// =============================================================================

/**
 * Update event visibility (publish/unpublish/archive).
 */
export const updateEventVisibility = withAuthenticatedUser<ActionResult<{ visibility: string }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateEventVisibilitySchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = updateEventVisibilitySchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, visibility } = validated.data;

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

  let action: 'event.publish' | 'event.unpublish' | 'event.archive' | 'event.update';
  if (visibility === 'published' && previousVisibility !== 'published') {
    action = 'event.publish';
  } else if (visibility === 'archived') {
    action = 'event.archive';
  } else if (previousVisibility === 'published' && visibility !== 'published') {
    action = 'event.unpublish';
  } else {
    action = 'event.update';
  }

  const requestContext = await getRequestContext(await headers());
  await db.transaction(async (tx) => {
    await tx
      .update(eventEditions)
      .set({ visibility })
      .where(eq(eventEditions.id, editionId));

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

  revalidateTag(eventEditionDetailTag(editionId), { expire: 0 });
  revalidateTag(publicEventBySlugTag(edition.series.slug, edition.slug), { expire: 0 });

  return { ok: true, data: { visibility } };
});

// =============================================================================
// Set Registration Paused Action
// =============================================================================

/**
 * Pause or resume registration for an event.
 */
export const setRegistrationPaused = withAuthenticatedUser<ActionResult<{ paused: boolean }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof pauseRegistrationSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = pauseRegistrationSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, paused } = validated.data;

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

  const requestContext = await getRequestContext(await headers());
  await db.transaction(async (tx) => {
    await tx
      .update(eventEditions)
      .set({ isRegistrationPaused: paused })
      .where(eq(eventEditions.id, editionId));

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

  revalidateTag(eventEditionDetailTag(editionId), { expire: 0 });
  revalidateTag(publicEventBySlugTag(edition.series.slug, edition.slug), { expire: 0 });

  return { ok: true, data: { paused } };
});

// =============================================================================
// Check Slug Availability Action
// =============================================================================

/**
 * Check if a slug is available for a series or edition.
 */
export const checkSlugAvailability = withAuthenticatedUser<ActionResult<{ available: boolean }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof checkSlugAvailabilitySchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = checkSlugAvailabilitySchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { organizationId, seriesId, slug } = validated.data;

  if (organizationId) {
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

  if (seriesId) {
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
