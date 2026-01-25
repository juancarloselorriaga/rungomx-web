import { and, desc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  eventSeries,
  pricingTiers,
  registrations,
} from '@/db/schema';
import {
  eventEditionDetailTag,
  eventEditionPricingTag,
  eventEditionRegistrationsTag,
  eventEditionWebsiteTag,
  publicEventBySlugTag,
} from '@/lib/events/cache-tags';
import { safeCacheLife, safeCacheTag } from '@/lib/next-cache';

// Re-export shared types
export type { EventFaqItem, EventWaiver, EventPolicyConfig } from '@/lib/events/editions/queries';

// =============================================================================
// Types
// =============================================================================

export type PublicEventDetail = {
  id: string;
  publicCode: string;
  slug: string;
  editionLabel: string;
  visibility: string;
  seriesId: string;
  seriesSlug: string;
  description: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  isRegistrationPaused: boolean;
  isRegistrationOpen: boolean;
  locationDisplay: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  externalUrl: string | null;
  heroImageUrl: string | null;
  seriesName: string;
  sportType: string;
  organizationId: string;
  organizationName: string;
  sharedCapacity: number | null;
  distances: PublicDistanceInfo[];
  faqItems: {
    id: string;
    question: string;
    answer: string;
    sortOrder: number;
  }[];
  waivers: {
    id: string;
    title: string;
    body: string;
    versionHash: string;
    signatureType: 'checkbox' | 'initials' | 'signature';
    displayOrder: number;
  }[];
  policyConfig: {
    refundsAllowed: boolean;
    refundPolicyText: string | null;
    refundDeadline: Date | null;
    transfersAllowed: boolean;
    transferPolicyText: string | null;
    transferDeadline: Date | null;
    deferralsAllowed: boolean;
    deferralPolicyText: string | null;
    deferralDeadline: Date | null;
  } | null;
};

export type PublicDistanceInfo = {
  id: string;
  label: string;
  distanceValue: string | null;
  distanceUnit: string;
  kind: string;
  terrain: string | null;
  isVirtual: boolean;
  capacity: number | null;
  spotsRemaining: number | null;
  capacityScope: 'per_distance' | 'shared_pool';
  priceCents: number;
  currency: string;
};

export type PublicSeriesEditionSummary = {
  id: string;
  slug: string;
  editionLabel: string;
  startsAt: Date | null;
  timezone: string;
  locationDisplay: string | null;
  city: string | null;
  state: string | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  isRegistrationPaused: boolean;
  isRegistrationOpen: boolean;
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Get a public event by slug (series slug + edition slug).
 */
export async function getPublicEventBySlug(
  seriesSlug: string,
  editionSlug: string,
): Promise<PublicEventDetail | null> {
  'use cache: remote';
  safeCacheLife({ expire: 60 });
  safeCacheTag(publicEventBySlugTag(seriesSlug, editionSlug));

  const series = await db.query.eventSeries.findFirst({
    where: and(eq(eventSeries.slug, seriesSlug), isNull(eventSeries.deletedAt)),
    with: {
      organization: true,
    },
  });

  if (!series) {
    return null;
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(
      eq(eventEditions.seriesId, series.id),
      eq(eventEditions.slug, editionSlug),
      or(
        eq(eventEditions.visibility, 'published'),
        eq(eventEditions.visibility, 'unlisted'),
      ),
      isNull(eventEditions.deletedAt),
    ),
    with: {
      heroImage: true,
      policyConfig: true,
      distances: {
        where: isNull(eventDistances.deletedAt),
        orderBy: (d, { asc }) => [asc(d.sortOrder)],
        with: {
          pricingTiers: {
            where: isNull(pricingTiers.deletedAt),
            orderBy: (p, { asc }) => [asc(p.sortOrder)],
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

  if (!edition) {
    return null;
  }

  safeCacheTag(
    eventEditionDetailTag(edition.id),
    eventEditionPricingTag(edition.id),
    eventEditionRegistrationsTag(edition.id),
    eventEditionWebsiteTag(edition.id),
  );

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

  const sharedCapacity = edition.sharedCapacity ?? null;
  const hasSharedPool = Boolean(
    sharedCapacity &&
      edition.distances.some((d) => d.capacityScope === 'shared_pool'),
  );
  let sharedReservedCount = 0;

  if (hasSharedPool) {
    const sharedCounts = await db
      .select({ count: sql<number>`count(*)` })
      .from(registrations)
      .where(
        and(
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
      );
    sharedReservedCount = Number(sharedCounts[0]?.count ?? 0);
  }

  // Determine registration status
  let isRegistrationOpen = false;
  if (!edition.isRegistrationPaused) {
    const hasOpened = !edition.registrationOpensAt || now >= edition.registrationOpensAt;
    const hasNotClosed = !edition.registrationClosesAt || now <= edition.registrationClosesAt;
    isRegistrationOpen = hasOpened && hasNotClosed;
  }

  return {
    id: edition.id,
    publicCode: edition.publicCode,
    slug: edition.slug,
    editionLabel: edition.editionLabel,
    visibility: edition.visibility,
    seriesId: series.id,
    seriesSlug: series.slug,
    description: edition.description,
    startsAt: edition.startsAt,
    endsAt: edition.endsAt,
    timezone: edition.timezone,
    registrationOpensAt: edition.registrationOpensAt,
    registrationClosesAt: edition.registrationClosesAt,
    isRegistrationPaused: edition.isRegistrationPaused,
    isRegistrationOpen,
    locationDisplay: edition.locationDisplay,
    address: edition.address,
    city: edition.city,
    state: edition.state,
    country: edition.country,
    latitude: edition.latitude,
    longitude: edition.longitude,
    externalUrl: edition.externalUrl,
    heroImageUrl: edition.heroImage?.deletedAt ? null : edition.heroImage?.blobUrl ?? null,
    seriesName: series.name,
    sportType: series.sportType,
    organizationId: series.organizationId,
    organizationName: series.organization?.name ?? '',
    sharedCapacity: sharedCapacity,
    distances: edition.distances.map((d) => {
      const regCount = registrationCountMap.get(d.id) ?? 0;
      const spotsRemaining =
        d.capacityScope === 'shared_pool' && sharedCapacity
          ? Math.max(sharedCapacity - sharedReservedCount, 0)
          : d.capacity
            ? d.capacity - regCount
            : null;

      // Find the currently active pricing tier based on date range
      const activeTier =
        d.pricingTiers.find((tier) => {
          const startsOk = !tier.startsAt || tier.startsAt <= now;
          const endsOk = !tier.endsAt || tier.endsAt >= now;
          return startsOk && endsOk;
        }) ?? d.pricingTiers[0];

      return {
        id: d.id,
        label: d.label,
        distanceValue: d.distanceValue,
        distanceUnit: d.distanceUnit,
        kind: d.kind,
        terrain: d.terrain,
        isVirtual: d.isVirtual,
        capacity: d.capacity,
        spotsRemaining,
        capacityScope: d.capacityScope as 'per_distance' | 'shared_pool',
        priceCents: activeTier?.priceCents ?? 0,
        currency: activeTier?.currency ?? 'MXN',
      };
    }),
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
      signatureType: w.signatureType as 'checkbox' | 'initials' | 'signature',
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

export async function getPublicOtherEditionsForSeries(
  seriesId: string,
  currentEditionId: string,
  { limit = 10 }: { limit?: number } = {},
): Promise<PublicSeriesEditionSummary[]> {
  const editions = await db
    .select({
      id: eventEditions.id,
      slug: eventEditions.slug,
      editionLabel: eventEditions.editionLabel,
      startsAt: eventEditions.startsAt,
      timezone: eventEditions.timezone,
      locationDisplay: eventEditions.locationDisplay,
      city: eventEditions.city,
      state: eventEditions.state,
      registrationOpensAt: eventEditions.registrationOpensAt,
      registrationClosesAt: eventEditions.registrationClosesAt,
      isRegistrationPaused: eventEditions.isRegistrationPaused,
    })
    .from(eventEditions)
    .where(
      and(
        eq(eventEditions.seriesId, seriesId),
        ne(eventEditions.id, currentEditionId),
        eq(eventEditions.visibility, 'published'),
        isNull(eventEditions.deletedAt),
      ),
    )
    .orderBy(desc(eventEditions.startsAt), desc(eventEditions.createdAt))
    .limit(limit);

  const now = new Date();

  return editions.map((edition) => {
    let isRegistrationOpen = false;
    if (!edition.isRegistrationPaused) {
      const hasOpened = !edition.registrationOpensAt || now >= edition.registrationOpensAt;
      const hasNotClosed = !edition.registrationClosesAt || now <= edition.registrationClosesAt;
      isRegistrationOpen = hasOpened && hasNotClosed;
    }

    return {
      ...edition,
      isRegistrationOpen,
    };
  });
}
