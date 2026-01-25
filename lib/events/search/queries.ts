import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { connection } from 'next/server';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  eventSeries,
  media,
  pricingTiers,
} from '@/db/schema';

// =============================================================================
// Types
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
  timezone: string;
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
  isVirtual?: boolean; // true = virtual only, false = in-person only, undefined = all
  distanceMin?: number; // Minimum distance in km
  distanceMax?: number; // Maximum distance in km
  lat?: number; // User location latitude for proximity search
  lng?: number; // User location longitude for proximity search
  radiusKm?: number; // Search radius in kilometers
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

export type PublishedEventRoute = {
  seriesSlug: string;
  editionSlug: string;
  updatedAt: Date;
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Search published events with pagination and filtering.
 * Shared by API route and SSR pages to avoid self-fetch.
 */
export async function searchPublicEvents(
  params: SearchEventsParams,
): Promise<SearchEventsResult> {
  // Signal Next.js that this function requires request context (enables dynamic Date usage)
  if (process.env.NODE_ENV !== 'test') {
    await connection();
  }

  const { q, sportType, state, city, dateFrom, dateTo, month, distanceKind, openOnly, isVirtual, distanceMin, distanceMax, lat, lng, radiusKm } = params;
  const normalizedQuery = q?.trim();
  const searchQuery = normalizedQuery && normalizedQuery.length >= 3 ? normalizedQuery : undefined;
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
  if (searchQuery) {
    const likeQuery = `%${searchQuery}%`;
    const loweredName = sql`lower(${eventSeries.name})`;
    const loweredQuery = sql`lower(${searchQuery})`;
    const similarityExpr = sql`word_similarity(${loweredQuery}, ${loweredName})`;
    const textCondition = sql`(${similarityExpr} > 0.39 OR ${eventSeries.name} ILIKE ${likeQuery})`;
    conditions.push(textCondition);
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

  // Virtual/in-person event filter (events that have at least one virtual/in-person distance)
  if (isVirtual !== undefined) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${eventDistances}
        WHERE ${eventDistances.editionId} = ${eventEditions.id}
          AND ${eventDistances.isVirtual} = ${isVirtual}
          AND ${eventDistances.deletedAt} IS NULL
      )`,
    );
  }

  // Distance range filter (events with at least one distance in the specified km range)
  if (distanceMin !== undefined || distanceMax !== undefined) {
    // Build conditional parts for distance range
    const minCondition = distanceMin !== undefined
      ? sql`CAST(${eventDistances.distanceValue} AS NUMERIC) >= ${distanceMin}`
      : sql`TRUE`;
    const maxCondition = distanceMax !== undefined
      ? sql`CAST(${eventDistances.distanceValue} AS NUMERIC) <= ${distanceMax}`
      : sql`TRUE`;

    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${eventDistances}
        WHERE ${eventDistances.editionId} = ${eventEditions.id}
          AND ${eventDistances.distanceValue} IS NOT NULL
          AND ${eventDistances.deletedAt} IS NULL
          AND ${minCondition}
          AND ${maxCondition}
      )`,
    );
  }

  // Location + radius filter using Haversine formula (Earth radius = 6371 km)
  if (lat !== undefined && lng !== undefined && radiusKm !== undefined) {
    conditions.push(sql`${eventEditions.latitude} IS NOT NULL`);
    conditions.push(sql`${eventEditions.longitude} IS NOT NULL`);
    conditions.push(
      sql`(
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${lat})) *
            cos(radians(CAST(${eventEditions.latitude} AS DOUBLE PRECISION))) *
            cos(radians(CAST(${eventEditions.longitude} AS DOUBLE PRECISION)) - radians(${lng})) +
            sin(radians(${lat})) *
            sin(radians(CAST(${eventEditions.latitude} AS DOUBLE PRECISION)))
          ))
        )
      ) <= ${radiusKm}`,
    );
  }

  // Query events
  const orderBy = searchQuery
    ? [
        sql`word_similarity(lower(${searchQuery}), lower(${eventSeries.name})) DESC`,
        desc(eventEditions.startsAt),
      ]
    : [desc(eventEditions.startsAt)];

  const events = await db
    .select({
      id: eventEditions.id,
      publicCode: eventEditions.publicCode,
      slug: eventEditions.slug,
      editionLabel: eventEditions.editionLabel,
      startsAt: eventEditions.startsAt,
      endsAt: eventEditions.endsAt,
      timezone: eventEditions.timezone,
      locationDisplay: eventEditions.locationDisplay,
      city: eventEditions.city,
      state: eventEditions.state,
      country: eventEditions.country,
      registrationOpensAt: eventEditions.registrationOpensAt,
      registrationClosesAt: eventEditions.registrationClosesAt,
      isRegistrationPaused: eventEditions.isRegistrationPaused,
      heroImageMediaId: eventEditions.heroImageMediaId,
      heroImageUrl: media.blobUrl,
      seriesName: eventSeries.name,
      seriesSlug: eventSeries.slug,
      sportType: eventSeries.sportType,
    })
    .from(eventEditions)
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .leftJoin(
      media,
      and(eq(eventEditions.heroImageMediaId, media.id), isNull(media.deletedAt)),
    )
    .where(and(...conditions))
    .orderBy(...orderBy)
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
  const now = new Date();
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
      timezone: event.timezone,
      locationDisplay: event.locationDisplay,
      city: event.city,
      state: event.state,
      country: event.country,
      sportType: event.sportType,
      heroImageUrl: event.heroImageUrl ?? null,
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

/**
 * Return published event routes for sitemap generation.
 */
export async function getPublishedEventRoutesForSitemap(): Promise<PublishedEventRoute[]> {
  await connection();

  return db
    .select({
      seriesSlug: eventSeries.slug,
      editionSlug: eventEditions.slug,
      updatedAt: eventEditions.updatedAt,
    })
    .from(eventEditions)
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .where(
      and(
        eq(eventEditions.visibility, 'published'),
        isNull(eventEditions.deletedAt),
        isNull(eventSeries.deletedAt),
      ),
    )
    .orderBy(desc(eventEditions.updatedAt));
}
