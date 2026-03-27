import type { LocationValue } from '@/types/location';
import type {
  LocationProvider,
  LocationSearchOptions,
  ReverseGeocodeOptions,
} from './location-provider';

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
    country?: string;
    region?: string;
    place?: string;
    city?: string;
    postcode?: string;
    locality?: string;
    neighborhood?: string;
    context?: MapboxContext;
  } & Record<string, unknown>;
};

type MapboxGeocodeResponse = {
  features?: MapboxFeature[];
};

type MapboxContextEntry = {
  id?: string;
  name?: string;
  address_number?: string;
  street_name?: string;
  country_code?: string;
  region_code?: string;
  region_code_full?: string;
} & Record<string, unknown>;

type MapboxContext = {
  address?: MapboxContextEntry;
  street?: MapboxContextEntry;
  postcode?: MapboxContextEntry;
  neighborhood?: MapboxContextEntry;
  locality?: MapboxContextEntry;
  place?: MapboxContextEntry;
  region?: MapboxContextEntry;
  country?: MapboxContextEntry;
} & Record<string, unknown>;

type MapboxSearchBoxSuggestSuggestion = {
  name?: string;
  mapbox_id?: string;
  full_address?: string;
  place_formatted?: string;
  country_code?: string;
  address?: string;
  coordinates?: {
    latitude?: number;
    longitude?: number;
  };
  center?: [number, number];
  context?: {
    country?: {
      country_code?: string;
      name?: string;
    };
    region?: {
      name?: string;
    };
    place?: {
      name?: string;
    };
    locality?: {
      name?: string;
    };
    postcode?: {
      name?: string;
    };
    address?: {
      name?: string;
      address_number?: string;
      street_name?: string;
    };
    street?: {
      name?: string;
    };
  };
};

type MapboxSearchBoxSuggestResponse = {
  suggestions?: MapboxSearchBoxSuggestSuggestion[];
};

type MapboxSearchBoxRetrieveResponse = MapboxGeocodeResponse;

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
    url.searchParams.set('proximity', `${options.proximity.lng},${options.proximity.lat}`);
  }

  url.searchParams.set('autocomplete', 'true');
  // Prioritize address-level results for better street address matching
  // Valid v6 types: country, region, postcode, district, place, locality, neighborhood, street, block, address, secondary_address
  url.searchParams.set('types', 'address,street,place,locality,neighborhood');

  return url;
}

function buildSearchBoxSuggestUrl(
  query: string,
  sessionToken: string,
  options?: LocationSearchOptions,
) {
  const url = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');
  url.searchParams.set('q', query);
  url.searchParams.set('access_token', getMapboxAccessToken());
  url.searchParams.set('session_token', sessionToken);

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
    url.searchParams.set('proximity', `${options.proximity.lng},${options.proximity.lat}`);
  }

  url.searchParams.set('types', 'poi,address,place,locality,neighborhood');

  return url;
}

function buildSearchBoxRetrieveUrl(
  mapboxId: string,
  sessionToken: string,
  options?: LocationSearchOptions,
) {
  const url = new URL(
    `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}`,
  );
  url.searchParams.set('access_token', getMapboxAccessToken());
  url.searchParams.set('session_token', sessionToken);

  if (options?.language) {
    url.searchParams.set('language', options.language);
  }

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

function normalizeWhitespace(value: string | undefined | null) {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function joinLocationParts(parts: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const part of parts) {
    const normalized = normalizeWhitespace(part);
    if (!normalized) continue;

    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(normalized);
  }

  return values.join(', ');
}

function isCoordinateLike(value: string) {
  return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(value.trim());
}

function isMeaninglessDisplayLabel(value: string) {
  const normalized = normalizeWhitespace(value).toLocaleLowerCase();
  if (!normalized) return true;
  if (isCoordinateLike(normalized)) return true;

  const commaFree = normalized.replace(/,/g, ' ').trim();
  if (!commaFree) return true;

  if (!commaFree.includes(' ')) {
    return /^(parque|bosque|calle|avenida|av|road|street|st|venue|sede|lugar)$/.test(commaFree);
  }

  const [firstSegment] = normalized.split(',');
  return /^(parque|bosque|calle|avenida|av|road|street|st)$/.test(firstSegment?.trim() ?? '');
}

function getContextName(context: MapboxContext | undefined, key: keyof MapboxContext) {
  const entry = context?.[key];
  if (!entry || typeof entry !== 'object' || !('name' in entry)) {
    return '';
  }

  return normalizeWhitespace(
    typeof entry.name === 'string' ? entry.name : undefined,
  );
}

function getContextCountryCode(context: MapboxContext | undefined) {
  return normalizeWhitespace(context?.country?.country_code);
}

function normalizeCountryCodeValue(value: string | undefined | null) {
  const normalized = normalizeWhitespace(value).toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : '';
}

function buildStreetAddress(
  directAddress: string | undefined,
  addressContext: MapboxContextEntry | undefined,
) {
  const direct = normalizeWhitespace(directAddress);
  if (direct) return direct;

  const contextName = normalizeWhitespace(addressContext?.name);
  if (contextName) return contextName;

  const streetName = normalizeWhitespace(addressContext?.street_name);
  const addressNumber = normalizeWhitespace(addressContext?.address_number);
  return joinLocationParts([streetName, addressNumber]).replace(', ', ' ').trim();
}

function buildAddressValue(options: {
  streetAddress?: string;
  fullAddress?: string;
  postalCode?: string;
  city?: string;
  locality?: string;
  region?: string;
  country?: string;
}) {
  const streetAddress = normalizeWhitespace(options.streetAddress);
  const fullAddress = normalizeWhitespace(options.fullAddress);
  const city = normalizeWhitespace(options.city);
  const locality = normalizeWhitespace(options.locality);
  const region = normalizeWhitespace(options.region);
  const country = normalizeWhitespace(options.country);
  const postalCode = normalizeWhitespace(options.postalCode);
  const cityOrLocality = city || locality;

  if (fullAddress) {
    const normalizedFullAddress = fullAddress.toLocaleLowerCase();
    const hierarchy = [postalCode, cityOrLocality, region, country].filter(Boolean);
    const containsHierarchy = hierarchy.some((part) =>
      normalizedFullAddress.includes(part.toLocaleLowerCase()),
    );

    if (!streetAddress || fullAddress.includes(',') || containsHierarchy) {
      return fullAddress;
    }
  }

  return (
    joinLocationParts([streetAddress, postalCode, cityOrLocality, region, country]) || fullAddress
  );
}

function buildPoiDisplayLabel(options: {
  name?: string;
  city?: string;
  locality?: string;
  region?: string;
  country?: string;
  fallback?: string;
}) {
  const name = normalizeWhitespace(options.name);
  const city = normalizeWhitespace(options.city);
  const locality = normalizeWhitespace(options.locality);
  const region = normalizeWhitespace(options.region);
  const country = normalizeWhitespace(options.country);
  const fallback = normalizeWhitespace(options.fallback);

  const display = joinLocationParts([name, city || locality, region, country]);
  if (display && !isMeaninglessDisplayLabel(display)) {
    return display;
  }

  if (fallback && !isMeaninglessDisplayLabel(fallback)) {
    return fallback;
  }

  return display || fallback;
}

function normalizeFeature(feature: MapboxFeature): LocationValue | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;

  const [lng, lat] = coordinates;
  const properties = feature.properties ?? {};
  const context = properties.context;
  const featureType = normalizeWhitespace(properties.feature_type as string | undefined);

  const name = normalizeWhitespace(
    (properties.name_preferred as string | undefined) ?? (properties.name as string | undefined),
  );
  const placeFormatted = normalizeWhitespace(properties.place_formatted as string | undefined);
  const fullAddress = normalizeWhitespace(properties.full_address as string | undefined);
  const postalCode =
    normalizeWhitespace(properties.postcode as string | undefined) || getContextName(context, 'postcode');
  const locality =
    normalizeWhitespace(properties.locality as string | undefined) || getContextName(context, 'locality');
  const city =
    normalizeWhitespace(properties.city as string | undefined) ||
    normalizeWhitespace(properties.place as string | undefined) ||
    getContextName(context, 'place') ||
    locality;
  const region =
    normalizeWhitespace(properties.region as string | undefined) ||
    normalizeWhitespace(properties.state as string | undefined) ||
    getContextName(context, 'region');
  const country = getContextName(context, 'country') || normalizeWhitespace(properties.country as string | undefined);
  const streetAddress = buildStreetAddress(
    properties.address as string | undefined,
    context?.address,
  );
  const address = buildAddressValue({
    streetAddress,
    fullAddress,
    postalCode,
    city,
    locality,
    region,
    country,
  });

  const fallbackFormattedAddress =
    fullAddress ||
    (name && placeFormatted
      ? `${name}, ${placeFormatted}`
      : placeFormatted || name || joinLocationParts([city || locality, region, country]));
  const formattedAddress =
    featureType === 'poi'
      ? buildPoiDisplayLabel({
          name,
          city,
          locality,
          region,
          country,
          fallback: fullAddress || joinLocationParts([name, placeFormatted, country]),
        })
      : fallbackFormattedAddress;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !formattedAddress) {
    return null;
  }

  const countryCode =
    normalizeCountryCodeValue(properties.country_code as string | undefined) ||
    normalizeCountryCodeValue(getContextCountryCode(context)) ||
    normalizeCountryCodeValue(properties.country as string | undefined);

  const placeId = (properties.mapbox_id as string | undefined) ?? feature.id;

  return {
    lat,
    lng,
    formattedAddress,
    name: name || undefined,
    address: address || fallbackFormattedAddress || undefined,
    placeId: placeId || undefined,
    countryCode: countryCode || undefined,
    country: country || undefined,
    region: region || undefined,
    city: city || undefined,
    locality: locality || undefined,
    postalCode: postalCode || undefined,
    provider: 'mapbox',
    raw: feature,
  };
}

function normalizeSearchBoxSuggestion(suggestion: MapboxSearchBoxSuggestSuggestion): LocationValue | null {
  const lat = suggestion.coordinates?.latitude ?? suggestion.center?.[1];
  const lng = suggestion.coordinates?.longitude ?? suggestion.center?.[0];
  const name = normalizeWhitespace(suggestion.name);
  const locality = normalizeWhitespace(suggestion.context?.locality?.name);
  const city = normalizeWhitespace(suggestion.context?.place?.name) || locality;
  const region = normalizeWhitespace(suggestion.context?.region?.name);
  const country = normalizeWhitespace(suggestion.context?.country?.name);
  const postalCode = normalizeWhitespace(suggestion.context?.postcode?.name);
  const streetAddress =
    normalizeWhitespace(suggestion.address) ||
    buildStreetAddress(undefined, {
      ...suggestion.context?.address,
      name: suggestion.context?.address?.name,
    });
  const address = buildAddressValue({
    streetAddress,
    fullAddress: suggestion.full_address,
    postalCode,
    city,
    locality,
    region,
    country,
  });
  const formattedAddress = buildPoiDisplayLabel({
    name,
    city,
    locality,
    region,
    country,
    fallback:
      normalizeWhitespace(suggestion.full_address) ||
      joinLocationParts([name, suggestion.place_formatted, country]),
  });

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !formattedAddress) {
    return null;
  }

  const safeLat = lat as number;
  const safeLng = lng as number;

  return {
    lat: safeLat,
    lng: safeLng,
    formattedAddress,
    name: name || undefined,
    address: address || undefined,
    placeId: suggestion.mapbox_id || undefined,
    countryCode:
      normalizeCountryCodeValue(suggestion.country_code) ||
      normalizeCountryCodeValue(suggestion.context?.country?.country_code) ||
      undefined,
    country: country || undefined,
    region: region || undefined,
    city: city || undefined,
    locality: locality || undefined,
    postalCode: postalCode || undefined,
    provider: 'mapbox',
    raw: suggestion,
  };
}

function mergeLocations(primary: LocationValue, fallback: LocationValue | null): LocationValue {
  if (!fallback) return primary;

  return {
    ...fallback,
    ...primary,
    formattedAddress:
      !isMeaninglessDisplayLabel(primary.formattedAddress) && primary.formattedAddress
        ? primary.formattedAddress
        : fallback.formattedAddress,
    address: primary.address ?? fallback.address,
    city: primary.city ?? fallback.city,
    locality: primary.locality ?? fallback.locality,
    region: primary.region ?? fallback.region,
    country: primary.country ?? fallback.country,
    countryCode: primary.countryCode ?? fallback.countryCode,
    postalCode: primary.postalCode ?? fallback.postalCode,
    name: primary.name ?? fallback.name,
    raw: primary.raw ?? fallback.raw,
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

async function fetchSearchBoxSuggest(url: URL): Promise<MapboxSearchBoxSuggestResponse> {
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Mapbox search box suggest failed with status ${response.status}`);
  }

  return (await response.json()) as MapboxSearchBoxSuggestResponse;
}

async function fetchSearchBoxRetrieve(url: URL): Promise<MapboxSearchBoxRetrieveResponse> {
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Mapbox search box retrieve failed with status ${response.status}`);
  }

  return (await response.json()) as MapboxSearchBoxRetrieveResponse;
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

  async searchPlaces(query, options) {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const sessionToken = crypto.randomUUID();
    const url = buildSearchBoxSuggestUrl(trimmed, sessionToken, options);
    const data = await fetchSearchBoxSuggest(url);
    const suggestions = data.suggestions ?? [];
    const retrievedLocations = await Promise.all(
      suggestions.map(async (suggestion) => {
        const suggestionLocation = normalizeSearchBoxSuggestion(suggestion);
        if (!suggestion.mapbox_id) {
          return suggestionLocation;
        }

        try {
          const retrieveUrl = buildSearchBoxRetrieveUrl(
            suggestion.mapbox_id,
            sessionToken,
            options,
          );
          const retrieved = await fetchSearchBoxRetrieve(retrieveUrl);
          const feature = retrieved.features?.[0];
          if (!feature) {
            return suggestionLocation;
          }

          const featureLocation = normalizeFeature(feature);
          return featureLocation ? mergeLocations(featureLocation, suggestionLocation) : suggestionLocation;
        } catch {
          return suggestionLocation;
        }
      }),
    );

    return retrievedLocations.filter((value): value is LocationValue => value !== null);
  },

  async reverseGeocode(lat, lng, options) {
    const url = buildReverseUrl(lat, lng, options);
    const data = await fetchJson(url);
    const feature = data.features?.[0];
    if (!feature) return null;
    return normalizeFeature(feature);
  },
};
