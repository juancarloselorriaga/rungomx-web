import type { PublicLocationValue } from '@/types/location';

type LocationSearchParams = {
  query: string;
  limit?: number;
  language?: string;
  country?: string;
  proximity?: {
    lat: number;
    lng: number;
  } | null;
};

type ReverseGeocodeParams = {
  lat: number;
  lng: number;
  language?: string;
  country?: string;
};

export async function searchLocationsClient(
  params: LocationSearchParams
): Promise<PublicLocationValue[]> {
  const trimmed = params.query.trim();
  if (trimmed.length < 3) {
    return [];
  }

  const searchParams = new URLSearchParams();
  searchParams.set('q', trimmed);

  if (params.limit && Number.isFinite(params.limit)) {
    searchParams.set('limit', String(params.limit));
  }

  if (params.language) {
    searchParams.set('language', params.language);
  }

  if (params.country) {
    searchParams.set('country', params.country);
  }

  if (params.proximity) {
    searchParams.set(
      'proximity',
      `${params.proximity.lng},${params.proximity.lat}`
    );
  }

  const response = await fetch(`/api/location/search?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`Location search failed with status ${response.status}`);
  }

  const data = (await response.json()) as { locations?: PublicLocationValue[] };
  return data.locations ?? [];
}

export async function reverseGeocodeClient(
  params: ReverseGeocodeParams
): Promise<PublicLocationValue | null> {
  const searchParams = new URLSearchParams();
  searchParams.set('lat', String(params.lat));
  searchParams.set('lng', String(params.lng));

  if (params.language) {
    searchParams.set('language', params.language);
  }

  if (params.country) {
    searchParams.set('country', params.country);
  }

  const response = await fetch(`/api/location/reverse?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`Reverse geocoding failed with status ${response.status}`);
  }

  const data = (await response.json()) as { location?: PublicLocationValue | null };
  return data.location ?? null;
}

