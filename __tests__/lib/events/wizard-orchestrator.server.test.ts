import {
  evaluateEventWizardCompleteness,
  getWizardStepHref,
  getEventWizardSteps,
  isWizardHardNavigationStep,
  resolveManualWizardStepTarget,
} from '@/lib/events/wizard/orchestrator';
import type { EventEditionDetail } from '@/lib/events/queries';

function buildEvent(overrides?: Partial<EventEditionDetail>): EventEditionDetail {
  return {
    id: 'event-123',
    publicCode: 'EVT123',
    slug: 'test-event',
    editionLabel: '2026',
    visibility: 'draft',
    description: null,
    startsAt: null,
    endsAt: null,
    timezone: 'America/Mexico_City',
    registrationOpensAt: null,
    registrationClosesAt: null,
    isRegistrationPaused: false,
    sharedCapacity: null,
    locationDisplay: null,
    address: null,
    city: null,
    state: null,
    country: 'MX',
    latitude: null,
    longitude: null,
    externalUrl: null,
    heroImageMediaId: null,
    heroImageUrl: null,
    seriesId: 'series-123',
    seriesName: 'Series',
    seriesSlug: 'series',
    sportType: 'trail_running',
    organizationId: 'org-123',
    organizationName: 'Org',
    organizationSlug: 'org',
    distances: [],
    faqItems: [],
    waivers: [],
    policyConfig: null,
    ...overrides,
  };
}

describe('event wizard orchestrator', () => {
  it('returns canonical step ids in stable order', () => {
    const steps = getEventWizardSteps('event-123');
    expect(steps.map((step) => step.id)).toEqual([
      'choose_path',
      'event_details',
      'distances',
      'pricing',
      'faq',
      'waivers',
      'questions',
      'policies',
      'website',
      'add_ons',
      'publish',
    ]);
  });

  it('surfaces missing required fields and publish blockers', () => {
    const result = evaluateEventWizardCompleteness(buildEvent(), null);

    expect(result.missingRequired.map((issue) => issue.code)).toEqual([
      'MISSING_EVENT_DATE',
      'MISSING_EVENT_LOCATION',
      'MISSING_DISTANCE',
    ]);
    expect(result.publishBlockers.map((issue) => issue.code)).toEqual(['MISSING_DISTANCE']);
    expect(result.completionByStepId.choose_path).toBe(false);
    expect(result.completionByStepId.publish).toBe(false);
  });

  it('builds prioritized checklist with blockers first and optional recommendations after required items', () => {
    const result = evaluateEventWizardCompleteness(buildEvent(), null);

    expect(result.prioritizedChecklist.map((issue) => issue.code)).toEqual([
      'MISSING_DISTANCE',
      'MISSING_EVENT_DATE',
      'MISSING_EVENT_LOCATION',
      'RECOMMEND_FAQ',
      'RECOMMEND_WAIVERS',
      'RECOMMEND_QUESTIONS',
      'RECOMMEND_WEBSITE',
      'RECOMMEND_ADD_ONS',
      'RECOMMEND_POLICIES',
    ]);
    expect(result.optionalRecommendations.every((issue) => issue.severity === 'optional')).toBe(true);
  });

  it('detects missing pricing tiers as publish blocker', () => {
    const result = evaluateEventWizardCompleteness(
      buildEvent({
        startsAt: new Date('2026-03-15T00:00:00.000Z'),
        city: 'Guadalajara',
        distances: [
          {
            id: 'distance-1',
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
            registrationCount: 0,
          },
        ],
      }),
      'ai',
    );

    expect(result.publishBlockers.map((issue) => issue.code)).toEqual(['MISSING_PRICING']);
    expect(result.completionByStepId.pricing).toBe(false);
  });

  it('marks required progress complete when path, details, distance, and pricing are complete', () => {
    const result = evaluateEventWizardCompleteness(
      buildEvent({
        startsAt: new Date('2026-03-15T00:00:00.000Z'),
        city: 'Guadalajara',
        distances: [
          {
            id: 'distance-1',
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
            priceCents: 35000,
            currency: 'MXN',
            hasPricingTier: true,
            registrationCount: 0,
          },
        ],
      }),
      'manual',
    );

    expect(result.missingRequired).toHaveLength(0);
    expect(result.publishBlockers).toHaveLength(0);
    expect(result.progress.percent).toBe(100);
  });

  it('enforces deterministic required-step sequencing on manual path while keeping optional steps accessible', () => {
    const steps = getEventWizardSteps('event-123');
    const completeness = evaluateEventWizardCompleteness(buildEvent(), 'manual');

    expect(
      resolveManualWizardStepTarget(
        steps,
        completeness.completionByStepId,
        'manual',
        'pricing',
      ),
    ).toBe('event_details');

    expect(
      resolveManualWizardStepTarget(
        steps,
        completeness.completionByStepId,
        'manual',
        'faq',
      ),
    ).toBe('faq');
  });

  it('does not enforce manual sequencing for ai path', () => {
    const steps = getEventWizardSteps('event-123');
    const completeness = evaluateEventWizardCompleteness(buildEvent(), 'ai');

    expect(
      resolveManualWizardStepTarget(
        steps,
        completeness.completionByStepId,
        'ai',
        'pricing',
      ),
    ).toBe('pricing');
  });

  it('resolves canonical step href and hard-navigation rules', () => {
    expect(getWizardStepHref('event-123', 'faq')).toBe('/dashboard/events/event-123/faq');
    expect(getWizardStepHref('event-123', 'add_ons')).toBe('/dashboard/events/event-123/add-ons');
    expect(isWizardHardNavigationStep('questions')).toBe(true);
    expect(isWizardHardNavigationStep('pricing')).toBe(false);
  });
});
