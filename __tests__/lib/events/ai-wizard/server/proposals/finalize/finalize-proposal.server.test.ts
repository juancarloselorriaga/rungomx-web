const mockProjectAggregateFromProposal = jest.fn();

jest.mock(
  '@/lib/events/ai-wizard/server/proposals/finalize/project-aggregate-from-proposal',
  () => ({
    projectAggregateFromProposal: (...args: unknown[]) => mockProjectAggregateFromProposal(...args),
  }),
);

import { finalizeProposalForUi } from '@/lib/events/ai-wizard/server/proposals/finalize/finalize-proposal';
import type { EventEditionDetail } from '@/lib/events/queries';

function buildEvent(overrides: Partial<EventEditionDetail> = {}): EventEditionDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    publicCode: 'EVT123',
    slug: 'test-event',
    editionLabel: '2026',
    visibility: 'draft',
    description: 'Public-facing event description',
    organizerBrief: null,
    startsAt: null,
    endsAt: null,
    timezone: 'America/Mexico_City',
    registrationOpensAt: null,
    registrationClosesAt: null,
    isRegistrationPaused: false,
    sharedCapacity: null,
    locationDisplay: null,
    address: null,
    city: 'Guadalajara',
    state: 'Jalisco',
    country: 'MX',
    latitude: null,
    longitude: null,
    externalUrl: null,
    heroImageMediaId: null,
    heroImageUrl: null,
    seriesId: 'series-1',
    seriesName: 'Series',
    seriesSlug: 'series',
    sportType: 'trail_running',
    organizationId: 'org-1',
    organizationName: 'Org',
    organizationSlug: 'org',
    distances: [],
    faqItems: [],
    waivers: [],
    policyConfig: null,
    ...overrides,
  };
}

describe('finalizeProposalForUi', () => {
  beforeEach(() => {
    mockProjectAggregateFromProposal.mockReset();
    mockProjectAggregateFromProposal.mockReturnValue({
      missingRequired: [
        {
          code: 'MISSING_EVENT_LOCATION',
          stepId: 'event_details',
          labelKey: 'wizard.issues.missingEventLocation',
          severity: 'required',
        },
      ],
      publishBlockers: [
        {
          code: 'MISSING_PRICING',
          stepId: 'pricing',
          labelKey: 'wizard.issues.publishMissingPricing',
          severity: 'blocker',
        },
      ],
      optionalRecommendations: [
        {
          code: 'RECOMMEND_WEBSITE',
          stepId: 'website',
          labelKey: 'wizard.issues.recommendWebsite',
          severity: 'optional',
        },
        {
          code: 'RECOMMEND_FAQ',
          stepId: 'faq',
          labelKey: 'wizard.issues.recommendFaq',
          severity: 'optional',
        },
      ],
    });
  });

  it('rebuilds server-owned checklist and location choice metadata outside the route', () => {
    const patch = finalizeProposalForUi(
      buildEvent(),
      {
        title: 'Choose the event location',
        summary: 'The organizer needs to pick one candidate.',
        ops: [
          {
            type: 'update_edition',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: {
              locationDisplay: 'Chapultepec',
            },
          },
        ],
      },
      {
        selectedPath: null,
        hasWebsiteContent: false,
        questionCount: 0,
        addOnCount: 0,
      },
      {
        status: 'ambiguous',
        query: 'Chapultepec',
        candidates: [
          {
            lat: 19.42,
            lng: -99.18,
            formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
            city: 'Ciudad de México',
            region: 'Ciudad de México',
            placeId: 'mapbox-1',
            provider: 'mapbox',
          },
          {
            lat: 19.29,
            lng: -99.51,
            formattedAddress: 'Chapultepec, Estado de México, México',
            city: 'Chapultepec',
            region: 'Estado de México',
            placeId: 'mapbox-2',
            provider: 'mapbox',
          },
        ],
      },
    );

    expect(patch.missingFieldsChecklist).toEqual([
      {
        code: 'MISSING_PRICING',
        stepId: 'pricing',
        label: 'wizard.issues.publishMissingPricing',
        severity: 'blocker',
      },
      {
        code: 'MISSING_EVENT_LOCATION',
        stepId: 'basics',
        label: 'wizard.issues.missingEventLocation',
        severity: 'required',
      },
    ]);
    expect(patch.intentRouting).toEqual([
      {
        intent: 'continue_content',
        stepId: 'content',
      },
    ]);
    expect(patch.locationResolution).toEqual({
      status: 'ambiguous',
      query: 'Chapultepec',
      candidates: [
        expect.objectContaining({
          formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
        }),
        expect.objectContaining({
          formattedAddress: 'Chapultepec, Estado de México, México',
        }),
      ],
    });
    expect(patch.choiceRequest).toEqual({
      kind: 'location_candidate_selection',
      selectionMode: 'single',
      sourceStepId: 'basics',
      targetField: 'event_location',
      query: 'Chapultepec',
      options: [
        expect.objectContaining({
          formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
        }),
        expect.objectContaining({
          formattedAddress: 'Chapultepec, Estado de México, México',
        }),
      ],
    });
  });

  it('does not emit a location choice request when the proposal does not touch location fields', () => {
    const patch = finalizeProposalForUi(
      buildEvent(),
      {
        title: 'Rewrite description only',
        summary: 'Keeps the proposal focused on participant copy.',
        ops: [
          {
            type: 'update_edition',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: {
              description: 'Bosque de Chapultepec como referencia en el copy.',
            },
          },
        ],
      },
      {
        selectedPath: null,
        hasWebsiteContent: false,
        questionCount: 0,
        addOnCount: 0,
      },
      {
        status: 'ambiguous',
        query: 'Chapultepec',
        candidates: [
          {
            lat: 19.42,
            lng: -99.18,
            formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
            city: 'Ciudad de México',
            region: 'Ciudad de México',
            placeId: 'mapbox-1',
            provider: 'mapbox',
          },
        ],
      },
    );

    expect(patch.locationResolution).toBeUndefined();
    expect(patch.choiceRequest).toBeUndefined();
  });
});
