import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLocationProvider } from '@/lib/location/location-provider';
import type { PublicLocationValue } from '@/types/location';

const querySchema = z.object({
  lat: z
    .string()
    .transform((value) => Number.parseFloat(value))
    .pipe(z.number()),
  lng: z
    .string()
    .transform((value) => Number.parseFloat(value))
    .pipe(z.number()),
  language: z.string().optional(),
  country: z.string().optional(),
});

type QueryParams = z.infer<typeof querySchema>;

const provider = getLocationProvider();

const reverseCache = new Map<string, { timestamp: number; location: PublicLocationValue | null }>();
const REVERSE_CACHE_TTL_MS = 5 * 60 * 1000;

function makeCacheKey(params: QueryParams) {
  return JSON.stringify({
    lat: Number(params.lat.toFixed(5)),
    lng: Number(params.lng.toFixed(5)),
    language: params.language ?? undefined,
    country: params.country ?? undefined,
  });
}

function getCachedResult(key: string) {
  const entry = reverseCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > REVERSE_CACHE_TTL_MS) {
    reverseCache.delete(key);
    return null;
  }

  return entry.location;
}

function setCachedResult(key: string, location: PublicLocationValue | null) {
  reverseCache.set(key, { timestamp: Date.now(), location });
}

function toPublicLocation(location: { raw?: unknown } | null): PublicLocationValue | null {
  if (!location) return null;
  const { raw: _raw, ...rest } = location as PublicLocationValue & { raw?: unknown };
  void _raw;
  return rest;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const rawQuery = {
      lat: url.searchParams.get('lat') ?? '',
      lng: url.searchParams.get('lng') ?? '',
      language: url.searchParams.get('language') ?? undefined,
      country: url.searchParams.get('country') ?? undefined,
    };

    const parsed = querySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_QUERY', details: z.treeifyError(parsed.error) },
        { status: 400 }
      );
    }

    const params = parsed.data;
    const cacheKey = makeCacheKey(params);
    const cached = getCachedResult(cacheKey);
    if (cached !== null) {
      return NextResponse.json({ location: cached });
    }

    const location = await provider.reverseGeocode(params.lat, params.lng, {
      language: params.language,
      country: params.country,
    });

    const publicLocation = toPublicLocation(location);
    setCachedResult(cacheKey, publicLocation);

    return NextResponse.json({ location: publicLocation });
  } catch (error) {
    console.error('[location-reverse] Error handling request', error);
    return NextResponse.json(
      { error: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
