import { getLocationProvider } from '@/lib/location/location-provider';
import type { EventEditionDetail } from '@/lib/events/queries';
import type { LocationValue, PublicLocationValue } from '@/types/location';

export type EventAiWizardLocationResolution =
  | {
      status: 'matched';
      query: string;
      candidate: PublicLocationValue;
    }
  | {
      status: 'ambiguous';
      query: string;
      candidates: PublicLocationValue[];
    }
  | {
      status: 'no_match';
      query: string;
    };

type ResolveLocationIntentOptions = {
  locale?: string | null;
  country?: string | null;
  limit?: number;
  proximity?: {
    lat: number;
    lng: number;
  };
};

export function buildAssistantLocationResolutionOptions(
  event: Pick<EventEditionDetail, 'country' | 'latitude' | 'longitude'>,
  locale?: string | null,
): ResolveLocationIntentOptions {
  const latitude = event.latitude ? Number(event.latitude) : Number.NaN;
  const longitude = event.longitude ? Number(event.longitude) : Number.NaN;

  return {
    locale: locale ?? 'es',
    country: event.country ?? 'MX',
    proximity:
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? {
            lat: latitude,
            lng: longitude,
          }
        : undefined,
  };
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function normalizeWhitespace(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function joinLocationParts(parts: Array<string | null | undefined>) {
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

function isCoordinateOnlyText(value: string) {
  return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(value.trim());
}

function isMeaninglessLocationDisplay(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value).toLocaleLowerCase();
  if (!normalized) return true;
  if (isCoordinateOnlyText(normalized)) return true;

  const [firstSegment] = normalized.split(',');
  return /^(parque|bosque|calle|avenida|av|road|street|st|venue|sede|lugar)$/.test(
    firstSegment?.trim() ?? '',
  );
}

function buildCleanLocationDisplay(
  location: Pick<LocationValue, 'formattedAddress' | 'name' | 'city' | 'locality' | 'region' | 'country'>,
  fallbackQuery: string,
) {
  const namedDisplay = location.name
    ? joinLocationParts([
        location.name,
        location.city ?? location.locality,
        location.region,
        location.country,
      ])
    : '';

  if (namedDisplay && !isMeaninglessLocationDisplay(namedDisplay)) {
    return namedDisplay;
  }

  if (
    location.formattedAddress &&
    !isMeaninglessLocationDisplay(location.formattedAddress)
  ) {
    return normalizeWhitespace(location.formattedAddress);
  }

  return (
    joinLocationParts([location.city ?? location.locality, location.region, location.country]) ||
    normalizeWhitespace(fallbackQuery)
  );
}

async function enrichMatchedLocation(
  location: LocationValue,
  query: string,
  options: ResolveLocationIntentOptions,
) {
  const provider = getLocationProvider();
  const reverseMatch = await provider
    .reverseGeocode(location.lat, location.lng, {
      language: options.locale ?? undefined,
      country: options.country ?? undefined,
    })
    .catch(() => null);

  const merged: LocationValue = {
    ...reverseMatch,
    ...location,
    address: reverseMatch?.address ?? location.address,
    city: reverseMatch?.city ?? location.city ?? reverseMatch?.locality ?? location.locality,
    locality: reverseMatch?.locality ?? location.locality,
    region: reverseMatch?.region ?? location.region,
    country: reverseMatch?.country ?? location.country,
    countryCode: reverseMatch?.countryCode ?? location.countryCode,
    postalCode: reverseMatch?.postalCode ?? location.postalCode,
    name: location.name ?? reverseMatch?.name,
    raw: location.raw ?? reverseMatch?.raw,
  };

  const formattedAddress = buildCleanLocationDisplay(merged, query);

  return {
    ...merged,
    formattedAddress,
    address:
      normalizeWhitespace(merged.address) ||
      normalizeWhitespace(reverseMatch?.formattedAddress) ||
      normalizeWhitespace(location.address) ||
      formattedAddress,
    city: normalizeWhitespace(merged.city) || undefined,
    locality: normalizeWhitespace(merged.locality) || undefined,
    region: normalizeWhitespace(merged.region) || undefined,
    country: normalizeWhitespace(merged.country) || undefined,
    countryCode: normalizeWhitespace(merged.countryCode) || undefined,
    postalCode: normalizeWhitespace(merged.postalCode) || undefined,
    name: normalizeWhitespace(merged.name) || undefined,
  };
}

function tokenize(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function splitLocationClauses(query: string) {
  return query
    .split(',')
    .map((part) => finalizeIntentQuery(part))
    .filter(Boolean);
}

function buildCandidateText(location: PublicLocationValue) {
  return [
    location.formattedAddress,
    location.city,
    location.region,
    location.countryCode,
    location.postalCode,
  ]
    .filter(Boolean)
    .join(' ');
}

function queryCoverageScore(query: string, location: PublicLocationValue) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;

  const candidateText = normalizeText(buildCandidateText(location));
  const matched = queryTokens.filter((token) => candidateText.includes(token)).length;
  return matched / queryTokens.length;
}

function clauseCoverageScore(query: string, location: PublicLocationValue) {
  const clauses = splitLocationClauses(query);
  const contextTokens = tokenize(clauses.slice(1).join(' '));

  if (contextTokens.length === 0) return 1;

  const candidateText = normalizeText(buildCandidateText(location));
  const matched = contextTokens.filter((token) => candidateText.includes(token)).length;
  return matched / contextTokens.length;
}

function locationMatchScore(query: string, location: PublicLocationValue) {
  const overallCoverage = queryCoverageScore(query, location);
  const contextCoverage = clauseCoverageScore(query, location);
  const normalizedCandidate = normalizeText(buildCandidateText(location));
  const normalizedPrimaryClause = normalizeText(splitLocationClauses(query)[0] ?? query);
  const primaryClauseMatched =
    normalizedPrimaryClause.length > 0 && normalizedCandidate.includes(normalizedPrimaryClause);

  return {
    overallCoverage,
    contextCoverage,
    primaryClauseMatched,
    combinedScore:
      overallCoverage +
      contextCoverage * 1.25 +
      (primaryClauseMatched ? 0.15 : 0),
  };
}

function isSpecificEnough(query: string) {
  const tokens = tokenize(query);
  return query.includes(',') || tokens.length >= 3 || /\d/.test(query);
}

function looksLikeVenueOrPoiQuery(query: string) {
  const normalized = normalizeText(query);
  return (
    /(?:\bparque\b|\bbosque\b|\bcampamento\b|\bestadio\b|\bvenue\b|\bsede\b|\btrail\b|\brancho\b|\breserva\b|\bclub\b|\bhotel\b|\bcentro\b|\barena\b|\bforum\b)/.test(
      normalized,
    ) || /[—–-]/.test(query)
  );
}

function finalizeIntentQuery(rawQuery: string) {
  return rawQuery
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildResolutionQueryVariants(query: string) {
  const variants = new Set<string>();
  const base = finalizeIntentQuery(query);
  if (!base) return [];

  variants.add(base);

  const commaClauses = base
    .split(',')
    .map((part) => finalizeIntentQuery(part))
    .filter(Boolean);
  const dashSplit = base
    .split(/[—–-]/)
    .map((part) => finalizeIntentQuery(part))
    .filter(Boolean);

  if (dashSplit.length > 1) {
    const primary = dashSplit[0];
    if (primary) {
      if (commaClauses.length <= 1) {
        variants.add(primary);
      }
      if (commaClauses.length > 1) {
        variants.add([primary, ...commaClauses.slice(1)].join(', '));
      }
    }
  }

  if (commaClauses.length >= 3) {
    variants.add([commaClauses[0], ...commaClauses.slice(-2)].join(', '));
  }

  return [...variants];
}

export function extractLocationIntentQuery(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const patterns = [
    /(?:\by\b|\band\b)\s+(.+?)\s+como\s+(?:ubicaci[oó]n(?:\s+exacta)?(?:\s+real)?(?:\s+del\s+evento)?|location(?:\s+for\s+the\s+event)?)(?:\s+(?:y|and)\s+|[.\n]|$)/i,
    /(?:usa|use)\s+(.+?)\s+como\s+(?:ubicaci[oó]n(?:\s+exacta)?(?:\s+real)?(?:\s+del\s+evento)?|location(?:\s+for\s+the\s+event)?)(?:\s+(?:y|and)\s+|[.\n]|$)/i,
    /(?:ubicaci[oó]n(?: exacta)?(?: del evento)?|location(?: for the event)?|venue|sede)(?:\s+(?:es|is|ser[áa]))?\s*[:\-]?\s*(.+?)(?:[.\n]|$)/i,
    /(?:\bser[áa]\s+en\b|\bes\s+en\b|\blocated\s+at\b|\bat\b)\s+(.+?)(?:[.\n]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const query = finalizeIntentQuery(match?.[1] ?? '');
    if (query.length >= 4) return query;
  }

  return null;
}

export function buildLocationResolutionQueryFromEditionUpdate(data: {
  locationDisplay?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}) {
  const primary = finalizeIntentQuery(data.locationDisplay ?? data.address ?? '');
  if (primary.length >= 4) return primary;

  const fallback = [data.address, data.city, data.state]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(', ');

  const resolved = finalizeIntentQuery(fallback);
  return resolved.length >= 4 ? resolved : null;
}

export async function resolveAiWizardLocationIntent(
  query: string,
  options: ResolveLocationIntentOptions = {},
): Promise<EventAiWizardLocationResolution> {
  const normalizedQuery = finalizeIntentQuery(query);
  if (normalizedQuery.length < 4) {
    return {
      status: 'no_match',
      query: normalizedQuery,
    };
  }

  const provider = getLocationProvider();
  let fallbackResolution: EventAiWizardLocationResolution | null = null;

  for (const candidateQuery of buildResolutionQueryVariants(normalizedQuery)) {
    const searchOptions = {
      limit: options.limit ?? 3,
      language: options.locale ?? undefined,
      country: options.country ?? undefined,
      proximity: options.proximity,
    };

    const searchPlaces = provider.searchPlaces;
    const prefersSearchBox = Boolean(searchPlaces) && looksLikeVenueOrPoiQuery(candidateQuery);

    const searchBoxResults = prefersSearchBox
      ? await searchPlaces!(candidateQuery, searchOptions)
      : [];
    const usingSearchBox = searchBoxResults.length > 0;

    const results =
      searchBoxResults.length > 0
        ? searchBoxResults
        : await provider.forwardGeocode(candidateQuery, searchOptions);

    if (results.length === 0) {
      continue;
    }

    const specificEnough = isSpecificEnough(candidateQuery);
    const queryTokens = tokenize(candidateQuery);
    const rankedResults = results
      .map((candidate) => ({
        candidate,
        score: locationMatchScore(candidateQuery, candidate),
      }))
      .sort((left, right) => right.score.combinedScore - left.score.combinedScore);
    const [best, secondBest] = rankedResults;

    if (results.length > 1 && queryTokens.length < 2 && !specificEnough) {
      fallbackResolution ??= {
        status: 'ambiguous',
        query: candidateQuery,
        candidates: results.slice(0, 3),
      };
      continue;
    }

    if (
      usingSearchBox &&
      best &&
      rankedResults.length === 1 &&
      specificEnough &&
      best.score.contextCoverage >= 0.6
    ) {
      return {
        status: 'matched',
        query: candidateQuery,
        candidate: await enrichMatchedLocation(best.candidate, normalizedQuery, options),
      };
    }

    if (
      best &&
      best.score.primaryClauseMatched &&
      best.score.overallCoverage >= (usingSearchBox ? 0.6 : 0.8) &&
      best.score.contextCoverage >= (usingSearchBox ? 0.6 : 0.8) &&
      (rankedResults.length === 1 ||
        specificEnough ||
        best.score.combinedScore - (secondBest?.score.combinedScore ?? 0) >= 0.15)
    ) {
      return {
        status: 'matched',
        query: candidateQuery,
        candidate: await enrichMatchedLocation(best.candidate, normalizedQuery, options),
      };
    }

    fallbackResolution ??= {
      status: 'ambiguous',
      query: candidateQuery,
      candidates: results.slice(0, 3),
    };
  }

  return (
    fallbackResolution ?? {
      status: 'no_match',
      query: normalizedQuery,
    }
  );
}

export async function resolveAssistantLocationQuery(
  query: string,
  options: ResolveLocationIntentOptions = {},
) {
  const resolution = await resolveAiWizardLocationIntent(query, options);

  if (resolution.status === 'matched') {
    return {
      status: 'matched' as const,
      query: resolution.query,
      match: resolution.candidate,
    };
  }

  return resolution;
}
