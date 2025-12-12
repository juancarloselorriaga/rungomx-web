import type { LocationProvider, LocationSearchOptions, ReverseGeocodeOptions } from './location-provider';
import type { LocationValue } from '@/types/location';

type MapboxFeature = {
  id?: string;
  geometry?: {
    type?: string;
    coordinates?: [number, number];
  };
  properties?: {
    // v6 API properties
    name?: string;
    name_preferred?: string;
    full_address?: string;
    place_formatted?: string;
    // Address components
    address?: string;
    street?: string;
    mapbox_id?: string;
    feature_type?: string;
    // Context/hierarchy
    country_code?: string;
    region?: string;
    place?: string;
    city?: string;
    postcode?: string;
    locality?: string;
    neighborhood?: string;
    context?: Record<string, unknown>;
  } & Record<string, unknown>;
};

type MapboxGeocodeResponse = {
  features?: MapboxFeature[];
};

function getMapboxAccessToken() {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error('MAPBOX_ACCESS_TOKEN is not configured');
  }
  return token;
}

function buildForwardUrl(query: string, options?: LocationSearchOptions) {
  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.searchParams.set('q', query);
  url.searchParams.set('access_token', getMapboxAccessToken());

  if (options?.limit && Number.isFinite(options.limit)) {
    url.searchParams.set('limit', String(options.limit));
  }

  if (options?.language) {
    url.searchParams.set('language', options.language);
  }

  if (options?.country) {
    url.searchParams.set('country', options.country);
  }

  if (options?.proximity) {
    url.searchParams.set(
      'proximity',
      `${options.proximity.lng},${options.proximity.lat}`
    );
  }

  url.searchParams.set('autocomplete', 'true');
  // Prioritize address-level results for better street address matching
  // Valid v6 types: country, region, postcode, district, place, locality, neighborhood, street, block, address, secondary_address
  url.searchParams.set('types', 'address,street,place,locality,neighborhood');

  return url;
}

function buildReverseUrl(lat: number, lng: number, options?: ReverseGeocodeOptions) {
  const url = new URL('https://api.mapbox.com/search/geocode/v6/reverse');
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('access_token', getMapboxAccessToken());

  if (options?.language) {
    url.searchParams.set('language', options.language);
  }

  if (options?.country) {
    url.searchParams.set('country', options.country);
  }

  url.searchParams.set('limit', '1');

  return url;
}

function normalizeFeature(feature: MapboxFeature): LocationValue | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;

  const [lng, lat] = coordinates;
  const properties = feature.properties ?? {};

  // Debug: log the actual response structure
  console.log('[Mapbox v6] Feature properties:', JSON.stringify(properties, null, 2));

  // v6 API: For address types, 'name' contains street+number, 'place_formatted' has the rest
  // We need to combine them for a complete address
  const name = properties.name as string | undefined;
  const placeFormatted = properties.place_formatted as string | undefined;
  const fullAddress = properties.full_address as string | undefined;

  let formattedAddress = '';
  if (fullAddress) {
    // full_address is the most complete
    formattedAddress = fullAddress;
  } else if (name && placeFormatted) {
    // Combine name (street + number) with place_formatted (city, region, country)
    formattedAddress = `${name}, ${placeFormatted}`;
  } else {
    formattedAddress = placeFormatted ?? name ?? '';
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !formattedAddress) {
    return null;
  }

  const countryCode =
    (properties.country_code as string | undefined) ??
    (properties.country as string | undefined);

  const city =
    (properties.city as string | undefined) ??
    (properties.place as string | undefined);

  const region =
    (properties.region as string | undefined) ??
    (properties.state as string | undefined);

  const postalCode = properties.postcode as string | undefined;

  const placeId =
    (properties.mapbox_id as string | undefined) ??
    feature.id;

  return {
    lat,
    lng,
    formattedAddress,
    placeId: placeId || undefined,
    countryCode: countryCode || undefined,
    region: region || undefined,
    city: city || undefined,
    postalCode: postalCode || undefined,
    provider: 'mapbox',
    raw: feature,
  };
}

async function fetchJson(url: URL): Promise<MapboxGeocodeResponse> {
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Mapbox geocoding request failed with status ${response.status}`);
  }

  return (await response.json()) as MapboxGeocodeResponse;
}

export const mapboxLocationProvider: LocationProvider = {
  async forwardGeocode(query, options) {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const url = buildForwardUrl(trimmed, options);
    const data = await fetchJson(url);
    const features = data.features ?? [];

    return features
      .map((feature) => normalizeFeature(feature))
      .filter((value): value is LocationValue => value !== null);
  },

  async reverseGeocode(lat, lng, options) {
    const url = buildReverseUrl(lat, lng, options);
    const data = await fetchJson(url);
    const feature = data.features?.[0];
    if (!feature) return null;
    return normalizeFeature(feature);
  },
};

