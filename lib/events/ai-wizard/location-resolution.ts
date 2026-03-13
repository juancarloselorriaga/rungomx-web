import { getLocationProvider } from '@/lib/location/location-provider';
import type { EventEditionDetail } from '@/lib/events/queries';
import type { PublicLocationValue } from '@/types/location';

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

function finalizeIntentQuery(rawQuery: string) {
  return rawQuery
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractLocationIntentQuery(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const patterns = [
    /(?:ubicaci[oó]n(?: exacta)?(?: del evento)?|location(?: for the event)?|venue|sede)(?:\s+(?:es|is|ser[áa]))?\s*[:\-]?\s*(.+?)(?:[.\n]|$)/i,
    /(?:ser[áa]\s+en|es\s+en|located\s+at|at)\s+(.+?)(?:[.\n]|$)/i,
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
  const results = await provider.forwardGeocode(normalizedQuery, {
    limit: options.limit ?? 3,
    language: options.locale ?? undefined,
    country: options.country ?? undefined,
    proximity: options.proximity,
  });

  if (results.length === 0) {
    return {
      status: 'no_match',
      query: normalizedQuery,
    };
  }

  const specificEnough = isSpecificEnough(normalizedQuery);
  const queryTokens = tokenize(normalizedQuery);
  const rankedResults = results
    .map((candidate) => ({
      candidate,
      score: locationMatchScore(normalizedQuery, candidate),
    }))
    .sort((left, right) => right.score.combinedScore - left.score.combinedScore);
  const [best, secondBest] = rankedResults;

  if (results.length > 1 && queryTokens.length < 2 && !specificEnough) {
    return {
      status: 'ambiguous',
      query: normalizedQuery,
      candidates: results.slice(0, 3),
    };
  }

  if (
    best &&
    best.score.primaryClauseMatched &&
    best.score.overallCoverage >= 0.8 &&
    best.score.contextCoverage >= 0.8 &&
    (rankedResults.length === 1 ||
      specificEnough ||
      best.score.combinedScore - (secondBest?.score.combinedScore ?? 0) >= 0.15)
  ) {
    return {
      status: 'matched',
      query: normalizedQuery,
      candidate: best.candidate,
    };
  }

  return {
    status: 'ambiguous',
    query: normalizedQuery,
    candidates: results.slice(0, 3),
  };
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
