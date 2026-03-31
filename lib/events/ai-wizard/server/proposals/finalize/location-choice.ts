import {
  eventAiWizardChoiceRequestSchema,
  type EventAiWizardPatch,
  type EventAiWizardChoiceRequest,
} from '@/lib/events/ai-wizard/schemas';
import type { EventAiWizardLocationResolution } from '@/lib/events/ai-wizard/location-resolution';
import type { PublicLocationValue } from '@/types/location';

function serializeResolvedLocationCandidate(candidate: PublicLocationValue) {
  return {
    formattedAddress: candidate.formattedAddress,
    name: candidate.name,
    address: candidate.address,
    lat: candidate.lat,
    lng: candidate.lng,
    city: candidate.city,
    locality: candidate.locality,
    region: candidate.region,
    countryCode: candidate.countryCode,
    country: candidate.country,
    placeId: candidate.placeId,
    provider: candidate.provider,
  };
}

export function buildResolvedLocationEditionData(candidate: PublicLocationValue) {
  return {
    locationDisplay: candidate.formattedAddress,
    address: candidate.address ?? candidate.formattedAddress,
    city: candidate.city ?? null,
    state: candidate.region ?? null,
    country: candidate.countryCode ?? null,
    latitude: String(candidate.lat),
    longitude: String(candidate.lng),
  };
}

export function sanitizeResolvedLocationForUi(
  resolvedLocation: EventAiWizardLocationResolution,
): EventAiWizardPatch['locationResolution'] {
  if (resolvedLocation.status === 'matched') {
    return {
      status: 'matched',
      query: resolvedLocation.query,
      candidate: serializeResolvedLocationCandidate(resolvedLocation.candidate),
    };
  }

  if (resolvedLocation.status === 'ambiguous') {
    return {
      status: 'ambiguous',
      query: resolvedLocation.query,
      candidates: resolvedLocation.candidates.map((candidate) =>
        serializeResolvedLocationCandidate(candidate),
      ),
    };
  }

  return resolvedLocation;
}

export function buildLocationChoiceRequest(
  resolvedLocation: EventAiWizardLocationResolution,
): EventAiWizardChoiceRequest | undefined {
  if (resolvedLocation.status !== 'ambiguous') return undefined;

  return eventAiWizardChoiceRequestSchema.parse({
    kind: 'location_candidate_selection',
    selectionMode: 'single',
    sourceStepId: 'basics',
    targetField: 'event_location',
    query: resolvedLocation.query,
    options: resolvedLocation.candidates
      .map((candidate) => serializeResolvedLocationCandidate(candidate))
      .slice(0, 4),
  });
}
