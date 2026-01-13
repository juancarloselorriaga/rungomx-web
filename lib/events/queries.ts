import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  eventSeries,
  organizationMemberships,
  organizations,
  pricingTiers,
  registrations,
} from '@/db/schema';
import type { OrgMembershipRole } from './constants';

// =============================================================================
// Organization Queries
// =============================================================================

export type UserOrganization = {
  id: string;
  name: string;
  slug: string;
  role: OrgMembershipRole;
  createdAt: Date;
};

/**
 * Get all organizations a user is a member of.
 */
export async function getUserOrganizations(userId: string): Promise<UserOrganization[]> {
  const memberships = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: organizationMemberships.role,
      createdAt: organizations.createdAt,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        isNull(organizationMemberships.deletedAt),
        isNull(organizations.deletedAt),
      ),
    )
    .orderBy(asc(organizations.name));

  return memberships.map((m) => ({
    id: m.id,
    name: m.name,
    slug: m.slug,
    role: m.role as OrgMembershipRole,
    createdAt: m.createdAt,
  }));
}

/**
 * Get event series for an organization.
 */
export type EventSeriesSummary = {
  id: string;
  name: string;
  slug: string;
  sportType: string;
};

export async function getOrganizationEventSeries(
  organizationId: string,
): Promise<EventSeriesSummary[]> {
  const series = await db.query.eventSeries.findMany({
    where: and(
      eq(eventSeries.organizationId, organizationId),
      isNull(eventSeries.deletedAt),
    ),
    orderBy: [asc(eventSeries.name)],
  });

  return series.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    sportType: s.sportType,
  }));
}

// =============================================================================
// Event Queries
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
  distanceCount: number;
  registrationCount: number;
  createdAt: Date;
};

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
      createdAt: eventEditions.createdAt,
      seriesName: eventSeries.name,
      seriesSlug: eventSeries.slug,
      organizationId: eventSeries.organizationId,
      organizationName: organizations.name,
    })
    .from(eventEditions)
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .innerJoin(organizations, eq(eventSeries.organizationId, organizations.id))
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

  const registrationCounts = await db
    .select({
      editionId: registrations.editionId,
      count: sql<number>`count(*)`,
    })
    .from(registrations)
    .where(
      and(
        sql`${registrations.editionId} IN ${eventIds}`,
        eq(registrations.status, 'confirmed'),
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
    distanceCount: distanceCountMap.get(event.id) ?? 0,
    registrationCount: registrationCountMap.get(event.id) ?? 0,
    createdAt: event.createdAt,
  }));
}

/**
 * Get a single event edition with full details.
 */
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
  locationDisplay: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  externalUrl: string | null;
  heroImageMediaId: string | null;
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
};

export async function getEventEditionDetail(eventId: string): Promise<EventEditionDetail | null> {
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, eventId), isNull(eventEditions.deletedAt)),
    with: {
      series: {
        with: {
          organization: true,
        },
      },
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
      },
    },
  });

  if (!edition?.series?.organization) {
    return null;
  }

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
          eq(registrations.status, 'confirmed'),
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
    locationDisplay: edition.locationDisplay,
    address: edition.address,
    city: edition.city,
    state: edition.state,
    country: edition.country,
    latitude: edition.latitude,
    longitude: edition.longitude,
    externalUrl: edition.externalUrl,
    heroImageMediaId: edition.heroImageMediaId,
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
    })),
  };
}

/**
 * Get a public event by slug (series slug + edition slug).
 */
export type PublicEventDetail = {
  id: string;
  publicCode: string;
  slug: string;
  editionLabel: string;
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
  organizationName: string;
  distances: PublicDistanceInfo[];
  faqItems: EventFaqItem[];
  waivers: EventWaiver[];
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
  priceCents: number;
  currency: string;
};

export async function getPublicEventBySlug(
  seriesSlug: string,
  editionSlug: string,
): Promise<PublicEventDetail | null> {
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
      eq(eventEditions.visibility, 'published'),
      isNull(eventEditions.deletedAt),
    ),
    with: {
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
      },
    },
  });

  if (!edition) {
    return null;
  }

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
          eq(registrations.status, 'confirmed'),
          isNull(registrations.deletedAt),
        ),
      )
      .groupBy(registrations.distanceId);

    registrationCountMap = new Map(
      regCounts.map((r) => [r.distanceId, Number(r.count)]),
    );
  }

  // Determine registration status
  const now = new Date();
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
    heroImageUrl: null, // TODO: resolve media URL
    seriesName: series.name,
    sportType: series.sportType,
    organizationName: series.organization?.name ?? '',
    distances: edition.distances.map((d) => {
      const regCount = registrationCountMap.get(d.id) ?? 0;
      const spotsRemaining = d.capacity ? d.capacity - regCount : null;

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
        priceCents: d.pricingTiers[0]?.priceCents ?? 0,
        currency: d.pricingTiers[0]?.currency ?? 'MXN',
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
    })),
  };
}

// =============================================================================
// Public Event Search/Directory
// =============================================================================

export type PublicEventSummary = {
  id: string;
  publicCode: string;
  slug: string;
  editionLabel: string;
  seriesName: string;
  seriesSlug: string;
  startsAt: Date | null;
  endsAt: Date | null;
  locationDisplay: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  sportType: string;
  heroImageUrl: string | null;
  isRegistrationOpen: boolean;
  minPriceCents: number | null;
  currency: string;
};

export type SearchEventsParams = {
  q?: string;
  sportType?: string;
  state?: string;
  city?: string;
  dateFrom?: Date;
  dateTo?: Date;
  month?: string; // YYYY-MM format for specific month filtering
  distanceKind?: string; // Filter by distance kind (e.g., '5k', '10k', 'marathon', etc.)
  openOnly?: boolean; // Only show events with open registration
  page?: number;
  limit?: number;
};

export type SearchEventsResult = {
  events: PublicEventSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

/**
 * Search published events with pagination and filtering.
 * Shared by API route and SSR pages to avoid self-fetch.
 */
export async function searchPublicEvents(
  params: SearchEventsParams,
): Promise<SearchEventsResult> {
  const { q, sportType, state, city, dateFrom, dateTo, month, distanceKind, openOnly } = params;
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;
  // Note: 'now' is created lazily inside conditionals to avoid Next.js prerender issues

  // Build conditions
  const conditions = [
    eq(eventEditions.visibility, 'published'),
    isNull(eventEditions.deletedAt),
    isNull(eventSeries.deletedAt),
  ];

  // Text search
  if (q && q.trim().length >= 2) {
    conditions.push(sql`${eventSeries.name} ILIKE ${'%' + q.trim() + '%'}`);
  }

  // Sport type filter
  if (sportType) {
    conditions.push(eq(eventSeries.sportType, sportType));
  }

  // Location filters
  if (state) {
    conditions.push(eq(eventEditions.state, state));
  }
  if (city) {
    conditions.push(eq(eventEditions.city, city));
  }

  // Month filter (YYYY-MM format) - takes precedence over dateFrom/dateTo
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, monthNum] = month.split('-').map(Number);
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0, 23, 59, 59, 999); // Last day of month
    conditions.push(sql`${eventEditions.startsAt} >= ${monthStart}`);
    conditions.push(sql`${eventEditions.startsAt} <= ${monthEnd}`);
  } else {
    // Date range
    if (dateFrom) {
      conditions.push(sql`${eventEditions.startsAt} >= ${dateFrom}`);
    }
    if (dateTo) {
      conditions.push(sql`${eventEditions.startsAt} <= ${dateTo}`);
    }

    // Default: only future events (when no date filters applied)
    if (!dateFrom && !dateTo) {
      const now = new Date();
      const futureCondition = sql`(${eventEditions.startsAt} >= ${now} OR ${eventEditions.startsAt} IS NULL)`;
      conditions.push(futureCondition);
    }
  }

  // Distance kind filter (events that have at least one distance of this kind)
  if (distanceKind) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${eventDistances}
        WHERE ${eventDistances.editionId} = ${eventEditions.id}
          AND ${eventDistances.kind} = ${distanceKind}
          AND ${eventDistances.deletedAt} IS NULL
      )`,
    );
  }

  // Open registration only filter
  if (openOnly) {
    const now = new Date();
    conditions.push(
      sql`(
        ${eventEditions.isRegistrationPaused} = false
        AND (${eventEditions.registrationOpensAt} IS NULL OR ${eventEditions.registrationOpensAt} <= ${now})
        AND (${eventEditions.registrationClosesAt} IS NULL OR ${eventEditions.registrationClosesAt} >= ${now})
      )`,
    );
  }

  // Query events
  const events = await db
    .select({
      id: eventEditions.id,
      publicCode: eventEditions.publicCode,
      slug: eventEditions.slug,
      editionLabel: eventEditions.editionLabel,
      startsAt: eventEditions.startsAt,
      endsAt: eventEditions.endsAt,
      locationDisplay: eventEditions.locationDisplay,
      city: eventEditions.city,
      state: eventEditions.state,
      country: eventEditions.country,
      registrationOpensAt: eventEditions.registrationOpensAt,
      registrationClosesAt: eventEditions.registrationClosesAt,
      isRegistrationPaused: eventEditions.isRegistrationPaused,
      heroImageMediaId: eventEditions.heroImageMediaId,
      seriesName: eventSeries.name,
      seriesSlug: eventSeries.slug,
      sportType: eventSeries.sportType,
    })
    .from(eventEditions)
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .where(and(...conditions))
    .orderBy(desc(eventEditions.startsAt))
    .limit(limit)
    .offset(offset);

  // Get minimum price for each event
  const eventIds = events.map((e) => e.id);
  let priceMap = new Map<string, { minPrice: number; currency: string }>();

  if (eventIds.length > 0) {
    const prices = await db
      .select({
        editionId: eventDistances.editionId,
        minPrice: sql<number>`MIN(${pricingTiers.priceCents})`,
        currency: sql<string>`(ARRAY_AGG(${pricingTiers.currency}))[1]`,
      })
      .from(eventDistances)
      .innerJoin(pricingTiers, eq(eventDistances.id, pricingTiers.distanceId))
      .where(
        and(
          sql`${eventDistances.editionId} IN ${eventIds}`,
          isNull(eventDistances.deletedAt),
          isNull(pricingTiers.deletedAt),
        ),
      )
      .groupBy(eventDistances.editionId);

    priceMap = new Map(
      prices.map((p) => [p.editionId, { minPrice: Number(p.minPrice), currency: p.currency || 'MXN' }]),
    );
  }

  // Transform results
  const publicEvents: PublicEventSummary[] = events.map((event) => {
    const priceInfo = priceMap.get(event.id);

    // Determine registration status
    let isRegistrationOpen = false;
    if (!event.isRegistrationPaused) {
      const hasOpened = !event.registrationOpensAt || now >= event.registrationOpensAt;
      const hasNotClosed = !event.registrationClosesAt || now <= event.registrationClosesAt;
      isRegistrationOpen = hasOpened && hasNotClosed;
    }

    return {
      id: event.id,
      publicCode: event.publicCode,
      slug: event.slug,
      editionLabel: event.editionLabel,
      seriesName: event.seriesName,
      seriesSlug: event.seriesSlug,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      locationDisplay: event.locationDisplay,
      city: event.city,
      state: event.state,
      country: event.country,
      sportType: event.sportType,
      heroImageUrl: null, // TODO: resolve media URL
      isRegistrationOpen,
      minPriceCents: priceInfo?.minPrice ?? null,
      currency: priceInfo?.currency ?? 'MXN',
    };
  });

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(eventEditions)
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .where(and(...conditions));

  const total = Number(countResult[0]?.count ?? 0);
  const totalPages = Math.ceil(total / limit);

  return {
    events: publicEvents,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}
