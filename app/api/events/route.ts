import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { searchPublicEvents } from '@/lib/events/queries';
import { DISTANCE_KINDS, SPORT_TYPES } from '@/lib/events/constants';

/**
 * Public events search API.
 * Returns published events with optional filtering.
 * Uses shared searchPublicEvents() query function.
 */

const searchParamsSchema = z.object({
  // Text search
  q: z.string().optional(),

  // Filters
  sportType: z.enum(SPORT_TYPES).optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  distanceKind: z.enum(DISTANCE_KINDS).optional(),
  openOnly: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  // Virtual/in-person filter
  isVirtual: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  // Distance range (in km)
  distanceMin: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const parsed = parseFloat(v);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    }),
  distanceMax: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const parsed = parseFloat(v);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }),

  // Location + radius (proximity search)
  lat: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const parsed = parseFloat(v);
      return Number.isFinite(parsed) && parsed >= -90 && parsed <= 90 ? parsed : undefined;
    }),
  lng: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const parsed = parseFloat(v);
      return Number.isFinite(parsed) && parsed >= -180 && parsed <= 180 ? parsed : undefined;
    }),
  radiusKm: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const parsed = parseFloat(v);
      return Number.isFinite(parsed) && parsed > 0 && parsed <= 500 ? parsed : undefined;
    }),

  // Date range
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),

  // Pagination
  page: z
    .string()
    .optional()
    .transform((v) => {
      const parsed = parseInt(v || '1', 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const parsed = parseInt(v || '20', 10);
      return Number.isFinite(parsed) && parsed > 0 && parsed <= 50 ? parsed : 20;
    }),
});

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const rawParams = {
      q: url.searchParams.get('q') || undefined,
      sportType: url.searchParams.get('sportType') || undefined,
      state: url.searchParams.get('state') || undefined,
      city: url.searchParams.get('city') || undefined,
      distanceKind: url.searchParams.get('distanceKind') || undefined,
      openOnly: url.searchParams.get('openOnly') || undefined,
      isVirtual: url.searchParams.get('isVirtual') || undefined,
      distanceMin: url.searchParams.get('distanceMin') || undefined,
      distanceMax: url.searchParams.get('distanceMax') || undefined,
      lat: url.searchParams.get('lat') || undefined,
      lng: url.searchParams.get('lng') || undefined,
      radiusKm: url.searchParams.get('radiusKm') || undefined,
      dateFrom: url.searchParams.get('dateFrom') || undefined,
      dateTo: url.searchParams.get('dateTo') || undefined,
      month: url.searchParams.get('month') || undefined,
      page: url.searchParams.get('page') || undefined,
      limit: url.searchParams.get('limit') || undefined,
    };

    const parsed = searchParamsSchema.safeParse(rawParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_PARAMS', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { q, sportType, state, city, distanceKind, openOnly, isVirtual, distanceMin, distanceMax, lat, lng, radiusKm, dateFrom, dateTo, month, page, limit } = parsed.data;

    // Use shared query function
    const result = await searchPublicEvents({
      q,
      sportType,
      state,
      city,
      distanceKind,
      openOnly,
      isVirtual,
      distanceMin,
      distanceMax,
      lat,
      lng,
      radiusKm,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      month,
      page,
      limit,
    });

    // Serialize dates to ISO strings for JSON response
    const events = result.events.map((event) => ({
      ...event,
      startsAt: event.startsAt?.toISOString() ?? null,
      endsAt: event.endsAt?.toISOString() ?? null,
    }));

    return NextResponse.json({
      events,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('[events-search] Error handling request', error);
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  }
}
