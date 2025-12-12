import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLocationProvider } from '@/lib/location/location-provider';
import type { PublicLocationValue } from '@/types/location';

const querySchema = z.object({
  q: z.string().min(1),
  limit: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
      return parsed;
    }),
  language: z.string().optional(),
  country: z.string().optional(),
  proximity: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const [lngStr, latStr] = value.split(',');
      const lng = Number.parseFloat(lngStr);
      const lat = Number.parseFloat(latStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
      return { lat, lng };
    }),
});

type QueryParams = z.infer<typeof querySchema>;

const provider = getLocationProvider();

const searchCache = new Map<string, { timestamp: number; results: PublicLocationValue[] }>();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

function makeCacheKey(params: QueryParams) {
  const payload = {
    q: params.q.trim().toLowerCase(),
    limit: params.limit ?? undefined,
    language: params.language ?? undefined,
    country: params.country ?? undefined,
    proximity: params.proximity
      ? {
          lat: Number(params.proximity.lat.toFixed(4)),
          lng: Number(params.proximity.lng.toFixed(4)),
        }
      : undefined,
  };

  return JSON.stringify(payload);
}

function getCachedResults(key: string) {
  const entry = searchCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }

  return entry.results;
}

function setCachedResults(key: string, results: PublicLocationValue[]) {
  searchCache.set(key, { timestamp: Date.now(), results });
}

function toPublicLocations(
  locations: (PublicLocationValue & { raw?: unknown })[]
): PublicLocationValue[] {
  return locations.map((location) => {
    const { raw: _raw, ...rest } = location;
    void _raw;
    return rest;
  });
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const rawQuery = {
      q: url.searchParams.get('q') ?? '',
      limit: url.searchParams.get('limit') ?? undefined,
      language: url.searchParams.get('language') ?? undefined,
      country: url.searchParams.get('country') ?? undefined,
      proximity: url.searchParams.get('proximity') ?? undefined,
    };

    const parsed = querySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_QUERY', details: z.treeifyError(parsed.error) },
        { status: 400 }
      );
    }

    const params = parsed.data;
    const trimmedQuery = params.q.trim();

    if (trimmedQuery.length < 3) {
      return NextResponse.json({ locations: [] });
    }

    const cacheKey = makeCacheKey(params);
    const cached = getCachedResults(cacheKey);
    if (cached) {
      return NextResponse.json({ locations: cached });
    }

    const locations = await provider.forwardGeocode(trimmedQuery, {
      limit: params.limit ?? 5,
      language: params.language,
      country: params.country,
      proximity: params.proximity,
    });

    const publicLocations: PublicLocationValue[] = toPublicLocations(
      locations as (PublicLocationValue & { raw?: unknown })[]
    );
    setCachedResults(cacheKey, publicLocations);

    return NextResponse.json({ locations: publicLocations });
  } catch (error) {
    console.error('[location-search] Error handling request', error);
    return NextResponse.json(
      { error: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
