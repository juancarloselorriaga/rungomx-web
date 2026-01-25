import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { connection } from 'next/server';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  eventSeries,
  media,
  organizationMemberships,
  organizations,
  pricingTiers,
  registrations,
} from '@/db/schema';
import { eventEditionDetailTag } from '@/lib/events/cache-tags';
import { safeCacheLife, safeCacheTag } from '@/lib/next-cache';

// =============================================================================
// Types
// =============================================================================

/**
 * Event data for organizer dashboard.
 */
export type OrganizerEventSummary = {
  id: string;
  publicCode: string;
  slug: string;
  editionLabel: string;
  seriesName: string;
  seriesSlug: string;
  organizationId: string;
  organizationName: string;
  visibility: string;
  startsAt: Date | null;
  endsAt: Date | null;
  locationDisplay: string | null;
  city: string | null;
  state: string | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  isRegistrationPaused: boolean;
  heroImageMediaId: string | null;
  heroImageUrl: string | null;
  distanceCount: number;
  registrationCount: number;
  createdAt: Date;
};

export type EventEditionDetail = {
  id: string;
  publicCode: string;
  slug: string;
  editionLabel: string;
  visibility: string;
  description: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  isRegistrationPaused: boolean;
  sharedCapacity: number | null;
  locationDisplay: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  externalUrl: string | null;
  heroImageMediaId: string | null;
  heroImageUrl: string | null;
  seriesId: string;
  seriesName: string;
  seriesSlug: string;
  sportType: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  distances: EventDistanceDetail[];
  faqItems: EventFaqItem[];
  waivers: EventWaiver[];
  policyConfig: EventPolicyConfig | null;
};

export type EventDistanceDetail = {
  id: string;
  label: string;
  distanceValue: string | null;
  distanceUnit: string;
  kind: string;
  startTimeLocal: Date | null;
  timeLimitMinutes: number | null;
  terrain: string | null;
  isVirtual: boolean;
  capacity: number | null;
  capacityScope: string;
  sortOrder: number;
  priceCents: number;
  currency: string;
  registrationCount: number;
};

export type EventFaqItem = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
};

export type EventWaiver = {
  id: string;
  title: string;
  body: string;
  versionHash: string;
  signatureType: 'checkbox' | 'initials' | 'signature';
  displayOrder: number;
};

export type EventPolicyConfig = {
  refundsAllowed: boolean;
  refundPolicyText: string | null;
  refundDeadline: Date | null;
  transfersAllowed: boolean;
  transferPolicyText: string | null;
  transferDeadline: Date | null;
  deferralsAllowed: boolean;
  deferralPolicyText: string | null;
  deferralDeadline: Date | null;
};

export type SeriesEditionListItem = {
  id: string;
  slug: string;
  editionLabel: string;
  visibility: string;
  startsAt: Date | null;
  createdAt: Date;
  previousEditionId: string | null;
  clonedFromEditionId: string | null;
  registrationCount: number;
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Get all events for a user across their organizations.
 */
export async function getUserEvents(userId: string): Promise<OrganizerEventSummary[]> {
  // Get user's organization IDs
  const userOrgs = await db
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        isNull(organizationMemberships.deletedAt),
      ),
    );

  const orgIds = userOrgs.map((o) => o.organizationId);

  if (orgIds.length === 0) {
    return [];
  }

  // Get events with counts
  const events = await db
    .select({
      id: eventEditions.id,
      publicCode: eventEditions.publicCode,
      slug: eventEditions.slug,
      editionLabel: eventEditions.editionLabel,
      visibility: eventEditions.visibility,
      startsAt: eventEditions.startsAt,
      endsAt: eventEditions.endsAt,
      locationDisplay: eventEditions.locationDisplay,
      city: eventEditions.city,
      state: eventEditions.state,
      registrationOpensAt: eventEditions.registrationOpensAt,
      registrationClosesAt: eventEditions.registrationClosesAt,
      isRegistrationPaused: eventEditions.isRegistrationPaused,
      heroImageMediaId: eventEditions.heroImageMediaId,
      heroImageUrl: media.blobUrl,
      createdAt: eventEditions.createdAt,
      seriesName: eventSeries.name,
      seriesSlug: eventSeries.slug,
      organizationId: eventSeries.organizationId,
      organizationName: organizations.name,
    })
    .from(eventEditions)
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .innerJoin(organizations, eq(eventSeries.organizationId, organizations.id))
    .leftJoin(
      media,
      and(eq(eventEditions.heroImageMediaId, media.id), isNull(media.deletedAt)),
    )
    .where(
      and(
        sql`${eventSeries.organizationId} IN ${orgIds}`,
        isNull(eventEditions.deletedAt),
        isNull(eventSeries.deletedAt),
      ),
    )
    .orderBy(desc(eventEditions.createdAt));

  // Get distance and registration counts
  const eventIds = events.map((e) => e.id);

  if (eventIds.length === 0) {
    return [];
  }

  const distanceCounts = await db
    .select({
      editionId: eventDistances.editionId,
      count: sql<number>`count(*)`,
    })
    .from(eventDistances)
    .where(
      and(
        sql`${eventDistances.editionId} IN ${eventIds}`,
        isNull(eventDistances.deletedAt),
      ),
    )
    .groupBy(eventDistances.editionId);

  const now = new Date();
  const registrationCounts = await db
    .select({
      editionId: registrations.editionId,
      count: sql<number>`count(*)`,
    })
    .from(registrations)
    .where(
      and(
        sql`${registrations.editionId} IN ${eventIds}`,
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
    )
    .groupBy(registrations.editionId);

  const distanceCountMap = new Map(
    distanceCounts.map((d) => [d.editionId, Number(d.count)]),
  );
  const registrationCountMap = new Map(
    registrationCounts.map((r) => [r.editionId, Number(r.count)]),
  );

  return events.map((event) => ({
    id: event.id,
    publicCode: event.publicCode,
    slug: event.slug,
    editionLabel: event.editionLabel,
    seriesName: event.seriesName,
    seriesSlug: event.seriesSlug,
    organizationId: event.organizationId,
    organizationName: event.organizationName,
    visibility: event.visibility,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    locationDisplay: event.locationDisplay,
    city: event.city,
    state: event.state,
    registrationOpensAt: event.registrationOpensAt,
    registrationClosesAt: event.registrationClosesAt,
    isRegistrationPaused: event.isRegistrationPaused,
    heroImageMediaId: event.heroImageMediaId,
    heroImageUrl: event.heroImageUrl ?? null,
    distanceCount: distanceCountMap.get(event.id) ?? 0,
    registrationCount: registrationCountMap.get(event.id) ?? 0,
    createdAt: event.createdAt,
  }));
}

/**
 * Get a single event edition with full details.
 */
export async function getEventEditionDetail(eventId: string): Promise<EventEditionDetail | null> {
  if (process.env.NODE_ENV !== 'test') {
    await connection();
  }

  return getEventEditionDetailCached(eventId);
}

export async function getSeriesEditionsForDashboard(seriesId: string): Promise<SeriesEditionListItem[]> {
  if (process.env.NODE_ENV !== 'test') {
    await connection();
  }

  const rows = await db
    .select({
      id: eventEditions.id,
      slug: eventEditions.slug,
      editionLabel: eventEditions.editionLabel,
      visibility: eventEditions.visibility,
      startsAt: eventEditions.startsAt,
      createdAt: eventEditions.createdAt,
      previousEditionId: eventEditions.previousEditionId,
      clonedFromEditionId: eventEditions.clonedFromEditionId,
      registrationCount: sql<number>`count(${registrations.id})::int`,
    })
    .from(eventEditions)
    .leftJoin(
      registrations,
      and(eq(registrations.editionId, eventEditions.id), isNull(registrations.deletedAt)),
    )
    .where(and(eq(eventEditions.seriesId, seriesId), isNull(eventEditions.deletedAt)))
    .groupBy(eventEditions.id)
    .orderBy(desc(eventEditions.startsAt), desc(eventEditions.createdAt));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    editionLabel: r.editionLabel,
    visibility: r.visibility,
    startsAt: r.startsAt,
    createdAt: r.createdAt,
    previousEditionId: r.previousEditionId,
    clonedFromEditionId: r.clonedFromEditionId,
    registrationCount: Number(r.registrationCount) || 0,
  }));
}

async function getEventEditionDetailCached(eventId: string): Promise<EventEditionDetail | null> {
  'use cache: remote';
  safeCacheTag(eventEditionDetailTag(eventId));
  safeCacheLife({ expire: 60 });

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, eventId), isNull(eventEditions.deletedAt)),
    with: {
      series: {
        with: {
          organization: true,
        },
      },
      heroImage: true,
      policyConfig: true,
      distances: {
        where: isNull(eventDistances.deletedAt),
        orderBy: (d, { asc }) => [asc(d.sortOrder)],
        with: {
          pricingTiers: {
            where: isNull(pricingTiers.deletedAt),
            orderBy: (p, { asc }) => [asc(p.sortOrder)],
            limit: 1,
          },
        },
      },
      faqItems: {
        where: (f, { isNull }) => isNull(f.deletedAt),
        orderBy: (f, { asc }) => [asc(f.sortOrder)],
      },
      waivers: {
        where: (w, { isNull }) => isNull(w.deletedAt),
        orderBy: (w, { asc }) => [asc(w.displayOrder)],
      },
    },
  });

  if (!edition?.series?.organization) {
    return null;
  }

  const now = new Date();

  // Get registration counts per distance
  const distanceIds = edition.distances.map((d) => d.id);
  let registrationCountMap = new Map<string, number>();

  if (distanceIds.length > 0) {
    const regCounts = await db
      .select({
        distanceId: registrations.distanceId,
        count: sql<number>`count(*)`,
      })
      .from(registrations)
      .where(
        and(
          sql`${registrations.distanceId} IN ${distanceIds}`,
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
      )
      .groupBy(registrations.distanceId);

    registrationCountMap = new Map(
      regCounts.map((r) => [r.distanceId, Number(r.count)]),
    );
  }


  return {
    id: edition.id,
    publicCode: edition.publicCode,
    slug: edition.slug,
    editionLabel: edition.editionLabel,
    visibility: edition.visibility,
    description: edition.description,
    startsAt: edition.startsAt,
    endsAt: edition.endsAt,
    timezone: edition.timezone,
    registrationOpensAt: edition.registrationOpensAt,
    registrationClosesAt: edition.registrationClosesAt,
    isRegistrationPaused: edition.isRegistrationPaused,
    sharedCapacity: edition.sharedCapacity,
    locationDisplay: edition.locationDisplay,
    address: edition.address,
    city: edition.city,
    state: edition.state,
    country: edition.country,
    latitude: edition.latitude,
    longitude: edition.longitude,
    externalUrl: edition.externalUrl,
    heroImageMediaId: edition.heroImageMediaId,
    heroImageUrl: edition.heroImage?.deletedAt ? null : edition.heroImage?.blobUrl ?? null,
    seriesId: edition.seriesId,
    seriesName: edition.series.name,
    seriesSlug: edition.series.slug,
    sportType: edition.series.sportType,
    organizationId: edition.series.organizationId,
    organizationName: edition.series.organization.name,
    organizationSlug: edition.series.organization.slug,
    distances: edition.distances.map((d) => ({
      id: d.id,
      label: d.label,
      distanceValue: d.distanceValue,
      distanceUnit: d.distanceUnit,
      kind: d.kind,
      startTimeLocal: d.startTimeLocal,
      timeLimitMinutes: d.timeLimitMinutes,
      terrain: d.terrain,
      isVirtual: d.isVirtual,
      capacity: d.capacity,
      capacityScope: d.capacityScope,
      sortOrder: d.sortOrder,
      priceCents: d.pricingTiers[0]?.priceCents ?? 0,
      currency: d.pricingTiers[0]?.currency ?? 'MXN',
      registrationCount: registrationCountMap.get(d.id) ?? 0,
    })),
    faqItems: edition.faqItems.map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      sortOrder: f.sortOrder,
    })),
    waivers: edition.waivers.map((w) => ({
      id: w.id,
      title: w.title,
      body: w.body,
      versionHash: w.versionHash,
      signatureType: w.signatureType as EventWaiver['signatureType'],
      displayOrder: w.displayOrder,
    })),
    policyConfig: edition.policyConfig
      ? {
          refundsAllowed: edition.policyConfig.refundsAllowed,
          refundPolicyText: edition.policyConfig.refundPolicyText,
          refundDeadline: edition.policyConfig.refundDeadline,
          transfersAllowed: edition.policyConfig.transfersAllowed,
          transferPolicyText: edition.policyConfig.transferPolicyText,
          transferDeadline: edition.policyConfig.transferDeadline,
          deferralsAllowed: edition.policyConfig.deferralsAllowed,
          deferralPolicyText: edition.policyConfig.deferralPolicyText,
          deferralDeadline: edition.policyConfig.deferralDeadline,
        }
      : null,
  };
}
