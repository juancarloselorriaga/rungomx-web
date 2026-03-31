const mockBuildEventWizardAggregate = jest.fn();

jest.mock('@/lib/events/wizard/orchestrator', () => ({
  buildEventWizardAggregate: (...args: unknown[]) => mockBuildEventWizardAggregate(...args),
}));

import { projectAggregateFromProposal } from '@/lib/events/ai-wizard/server/proposals/finalize/project-aggregate-from-proposal';
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

describe('projectAggregateFromProposal', () => {
  beforeEach(() => {
    mockBuildEventWizardAggregate.mockReset();
    mockBuildEventWizardAggregate.mockReturnValue({
      missingRequired: [],
      publishBlockers: [],
      optionalRecommendations: [],
      prioritizedChecklist: [],
      completionByStepId: {} as never,
      setupStepStateById: {} as never,
      capabilityLocks: {} as never,
      progress: { completedRequired: 0, totalRequired: 0, percent: 0 },
    });
  });

  it('only marks the targeted existing distance as priced', () => {
    const event = buildEvent({
      distances: [
        {
          id: 'distance-a',
          label: '10K',
          distanceValue: '10',
          distanceUnit: 'km',
          kind: 'distance',
          startTimeLocal: null,
          timeLimitMinutes: null,
          terrain: null,
          isVirtual: false,
          capacity: null,
          capacityScope: 'per_distance',
          sortOrder: 0,
          priceCents: 0,
          currency: 'MXN',
          hasPricingTier: false,
          pricingTierCount: 0,
          hasBoundedPricingTier: false,
          registrationCount: 0,
        },
        {
          id: 'distance-b',
          label: '21K',
          distanceValue: '21',
          distanceUnit: 'km',
          kind: 'distance',
          startTimeLocal: null,
          timeLimitMinutes: null,
          terrain: null,
          isVirtual: false,
          capacity: null,
          capacityScope: 'per_distance',
          sortOrder: 1,
          priceCents: 0,
          currency: 'MXN',
          hasPricingTier: false,
          pricingTierCount: 0,
          hasBoundedPricingTier: false,
          registrationCount: 0,
        },
      ],
    });

    projectAggregateFromProposal(
      event,
      {
        title: 'Add a pricing tier',
        summary: 'Only the target distance should become priced.',
        ops: [
          {
            type: 'create_pricing_tier',
            distanceId: 'distance-b',
            data: {
              priceCents: 55000,
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
    );

    const projectedEvent = mockBuildEventWizardAggregate.mock.calls[0]?.[0] as EventEditionDetail;
    expect(projectedEvent.distances).toEqual([
      expect.objectContaining({
        id: 'distance-a',
        hasPricingTier: false,
        pricingTierCount: 0,
        hasBoundedPricingTier: false,
      }),
      expect.objectContaining({
        id: 'distance-b',
        hasPricingTier: true,
        pricingTierCount: 1,
        hasBoundedPricingTier: true,
      }),
    ]);
  });

  it('derives created projected distances from the create_distance payload', () => {
    projectAggregateFromProposal(
      buildEvent(),
      {
        title: 'Create first distance',
        summary: 'Uses the exact proposed distance payload.',
        ops: [
          {
            type: 'create_distance',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: {
              label: '25K Trail',
              distanceValue: 25,
              distanceUnit: 'km',
              kind: 'distance',
              startTimeLocal: '2026-03-15T07:00:00.000Z',
              timeLimitMinutes: 300,
              terrain: 'trail',
              isVirtual: false,
              capacity: 250,
              capacityScope: 'per_distance',
              priceCents: 45900,
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
    );

    const projectedEvent = mockBuildEventWizardAggregate.mock.calls[0]?.[0] as EventEditionDetail;
    expect(projectedEvent.distances).toEqual([
      expect.objectContaining({
        id: 'projected-distance-0',
        label: '25K Trail',
        distanceValue: '25',
        distanceUnit: 'km',
        kind: 'distance',
        timeLimitMinutes: 300,
        terrain: 'trail',
        capacity: 250,
        capacityScope: 'per_distance',
        priceCents: 45900,
        hasPricingTier: true,
        pricingTierCount: 1,
        hasBoundedPricingTier: false,
      }),
    ]);
    expect(projectedEvent.distances[0]?.startTimeLocal?.toISOString()).toBe(
      '2026-03-15T07:00:00.000Z',
    );
  });

  it('projects registration window updates before rebuilding aggregate completeness', () => {
    mockBuildEventWizardAggregate.mockImplementation((projectedEvent: EventEditionDetail) => ({
      missingRequired:
        projectedEvent.registrationOpensAt && projectedEvent.registrationClosesAt
          ? []
          : [
              {
                code: 'MISSING_REGISTRATION_WINDOW',
                stepId: 'event_details',
                labelKey: 'wizard.issues.missingRegistrationWindow',
                severity: 'required',
              },
            ],
      publishBlockers: [],
      optionalRecommendations: [],
      prioritizedChecklist: [],
      completionByStepId: {} as never,
      setupStepStateById: {} as never,
      capabilityLocks: {} as never,
      progress: { completedRequired: 0, totalRequired: 0, percent: 0 },
    }));

    const result = projectAggregateFromProposal(
      buildEvent(),
      {
        title: 'Open registration window',
        summary: 'Sets the registration dates.',
        ops: [
          {
            type: 'update_edition',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: {
              registrationOpensAt: '2026-01-15T10:00:00.000Z',
              registrationClosesAt: '2026-03-10T23:59:00.000Z',
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
    );

    const projectedEvent = mockBuildEventWizardAggregate.mock.calls[0]?.[0] as EventEditionDetail;
    expect(projectedEvent.registrationOpensAt?.toISOString()).toBe('2026-01-15T10:00:00.000Z');
    expect(projectedEvent.registrationClosesAt?.toISOString()).toBe('2026-03-10T23:59:00.000Z');
    expect(result.missingRequired).toEqual([]);
  });
});
