import {
  buildEventWizardAggregate,
  evaluateEventWizardCompleteness,
  getWizardStepHref,
  getEventWizardSteps,
  isWizardHardNavigationStep,
  resolveManualWizardStepTarget,
} from '@/lib/events/wizard/orchestrator';
import type { EventEditionDetail } from '@/lib/events/queries';
import type { WebsiteContentBlocks } from '@/lib/events/website/types';

function buildEvent(overrides?: Partial<EventEditionDetail>): EventEditionDetail {
  const resolvedLatitude =
    overrides?.latitude !== undefined
      ? overrides.latitude
      : overrides?.city || overrides?.state || overrides?.locationDisplay
        ? '20.6597'
        : null;
  const resolvedLongitude =
    overrides?.longitude !== undefined
      ? overrides.longitude
      : overrides?.city || overrides?.state || overrides?.locationDisplay
        ? '-103.3496'
        : null;

  return {
    id: 'event-123',
    publicCode: 'EVT123',
    slug: 'test-event',
    editionLabel: '2026',
    visibility: 'draft',
    description: null,
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
    city: null,
    state: null,
    country: 'MX',
    latitude: resolvedLatitude,
    longitude: resolvedLongitude,
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
        startsAt: new Date('2026-03-15T13:00:00.000Z'),
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
            pricingTierCount: 0,
            hasBoundedPricingTier: false,
            registrationCount: 0,
          },
        ],
      }),
      'ai',
    );

    expect(result.publishBlockers.map((issue) => issue.code)).toEqual(['MISSING_PRICING']);
    expect(result.completionByStepId.pricing).toBe(false);
  });

  it('treats legacy UTC-midnight schedule values as missing a real start time in review', () => {
    const aggregate = buildEventWizardAggregate(
      buildEvent({
        startsAt: new Date('2026-10-12T00:00:00.000Z'),
        city: 'Ciudad de México',
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
            pricingTierCount: 1,
            hasBoundedPricingTier: false,
            registrationCount: 0,
          },
        ],
      }),
      {
        selectedPath: 'manual',
      },
    );

    expect(aggregate.missingRequired.map((issue) => issue.code)).toContain('MISSING_EVENT_DATE');
    expect(aggregate.completionByStepId.event_details).toBe(false);
    expect(aggregate.completionByStepId.publish).toBe(false);
    expect(aggregate.setupStepStateById.review.completed).toBe(false);
  });

  it('blocks publish readiness when participant-facing content contradicts persisted schedule or location truth', () => {
    const websiteContent: WebsiteContentBlocks = {
      schedule: {
        type: 'schedule',
        enabled: true,
        raceDay: 'The start time is still TBD.',
      },
      overview: {
        type: 'overview',
        enabled: true,
        content: 'Event location to be confirmed.',
      },
    };

    const aggregate = buildEventWizardAggregate(
      buildEvent({
        startsAt: new Date('2026-03-15T06:00:00.000Z'),
        endsAt: new Date('2026-03-15T14:00:00.000Z'),
        locationDisplay: 'Ciudad de México, México',
        city: 'Ciudad de México',
        state: 'Ciudad de México',
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
            pricingTierCount: 1,
            hasBoundedPricingTier: false,
            registrationCount: 0,
          },
        ],
      }),
      {
        selectedPath: 'manual',
        hasWebsiteContent: true,
        websiteContent,
      },
    );

    expect(aggregate.publishBlockers.map((issue) => issue.code)).toEqual([
      'CONTENT_SCHEDULE_TRUTH_CONFLICT',
      'CONTENT_LOCATION_TRUTH_CONFLICT',
    ]);
    expect(aggregate.completionByStepId.publish).toBe(false);
    expect(aggregate.setupStepStateById.review.completed).toBe(false);
  });

  it('blocks publish readiness when the event description still says "Fechas y hora: por confirmar"', () => {
    const aggregate = buildEventWizardAggregate(
      buildEvent({
        startsAt: new Date('2026-03-15T06:00:00.000Z'),
        endsAt: new Date('2026-03-15T14:00:00.000Z'),
        description: 'Fechas y hora: por confirmar',
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
            pricingTierCount: 1,
            hasBoundedPricingTier: false,
            registrationCount: 0,
          },
        ],
      }),
      {
        selectedPath: 'manual',
      },
    );

    expect(aggregate.publishBlockers.map((issue) => issue.code)).toContain(
      'CONTENT_SCHEDULE_TRUTH_CONFLICT',
    );
    expect(aggregate.completionByStepId.publish).toBe(false);
    expect(aggregate.setupStepStateById.review.completed).toBe(false);
  });

  it('blocks publish readiness when website overview says "Modalidad y horarios por confirmar"', () => {
    const websiteContent: WebsiteContentBlocks = {
      overview: {
        type: 'overview',
        enabled: true,
        content: 'Modalidad y horarios por confirmar',
      },
    };

    const aggregate = buildEventWizardAggregate(
      buildEvent({
        startsAt: new Date('2026-03-15T06:00:00.000Z'),
        endsAt: new Date('2026-03-15T14:00:00.000Z'),
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
            pricingTierCount: 1,
            hasBoundedPricingTier: false,
            registrationCount: 0,
          },
        ],
      }),
      {
        selectedPath: 'manual',
        hasWebsiteContent: true,
        websiteContent,
      },
    );

    expect(aggregate.publishBlockers.map((issue) => issue.code)).toContain(
      'CONTENT_SCHEDULE_TRUTH_CONFLICT',
    );
    expect(aggregate.completionByStepId.publish).toBe(false);
    expect(aggregate.setupStepStateById.review.completed).toBe(false);
  });

  it('keeps sufficiently structured saved locations publish-ready', () => {
    const aggregate = buildEventWizardAggregate(
      buildEvent({
        startsAt: new Date('2026-03-15T06:00:00.000Z'),
        endsAt: new Date('2026-03-15T14:00:00.000Z'),
        locationDisplay: 'Ciudad de México, México',
        city: 'Ciudad de México',
        state: 'Ciudad de México',
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
            pricingTierCount: 1,
            hasBoundedPricingTier: false,
            registrationCount: 0,
          },
        ],
      }),
      {
        selectedPath: 'manual',
      },
    );

    expect(aggregate.publishBlockers.map((issue) => issue.code)).not.toContain(
      'LOCATION_NEEDS_VENUE_CONFIRMATION',
    );
    expect(aggregate.completionByStepId.publish).toBe(true);
    expect(aggregate.setupStepStateById.review.completed).toBe(true);
  });

  it('blocks publish readiness when the saved location still looks like a plausible poi match', () => {
    const aggregate = buildEventWizardAggregate(
      buildEvent({
        startsAt: new Date('2026-03-15T06:00:00.000Z'),
        endsAt: new Date('2026-03-15T14:00:00.000Z'),
        locationDisplay: 'Jardin Botanico del Bosque de Chapultepec, Ciudad de Mexico, Mexico',
        city: 'Ciudad de Mexico',
        state: 'Ciudad de Mexico',
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
            pricingTierCount: 1,
            hasBoundedPricingTier: false,
            registrationCount: 0,
          },
        ],
      }),
      {
        selectedPath: 'manual',
      },
    );

    expect(aggregate.publishBlockers.map((issue) => issue.code)).toContain(
      'LOCATION_NEEDS_VENUE_CONFIRMATION',
    );
    expect(aggregate.publishBlockers.map((issue) => issue.labelKey)).toContain(
      'wizard.issues.publishLocationNeedsVenueConfirmation',
    );
    expect(aggregate.completionByStepId.publish).toBe(false);
    expect(aggregate.setupStepStateById.review.completed).toBe(false);
  });

  it('marks pricing diagnosis as covered when bounded pricing windows already exist', () => {
    const aggregate = buildEventWizardAggregate(
      buildEvent({
        startsAt: new Date('2026-03-15T13:00:00.000Z'),
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
            pricingTierCount: 4,
            hasBoundedPricingTier: true,
            registrationCount: 0,
          },
        ],
      }),
      {
        selectedPath: 'ai',
        hasWebsiteContent: false,
        questionCount: 0,
        addOnCount: 0,
      },
    );

    expect(aggregate.completionByStepId.pricing).toBe(true);
    expect(aggregate.stepDiagnosisById?.pricing).toEqual([]);
  });

  it('builds truthful setup-step state for registration, content, extras, and capability locks', () => {
    const aggregate = buildEventWizardAggregate(
      buildEvent({
        startsAt: new Date('2026-03-15T13:00:00.000Z'),
        city: 'Guadalajara',
        description: 'A focused trail race weekend.',
        registrationOpensAt: new Date('2025-12-01T00:00:00.000Z'),
        waivers: [
          {
            id: 'waiver-1',
            title: 'Participant waiver',
            body: 'Please read carefully.',
            versionHash: 'waiver-v1',
            signatureType: 'checkbox',
            displayOrder: 0,
          },
        ],
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
            pricingTierCount: 1,
            hasBoundedPricingTier: false,
            registrationCount: 0,
          },
        ],
      }),
      {
        selectedPath: 'manual',
        hasWebsiteContent: false,
        questionCount: 2,
        addOnCount: 1,
        capabilityLocks: {
          canUseAiAssistant: true,
          canApplyAiPatch: true,
          canPublishEvent: false,
        },
      },
    );

    expect(aggregate.setupStepStateById.registration.completed).toBe(true);
    expect(aggregate.setupStepStateById.content.completed).toBe(true);
    expect(aggregate.setupStepStateById.policies.completed).toBe(true);
    expect(aggregate.setupStepStateById.extras.completed).toBe(true);
    expect(aggregate.setupStepStateById.review.completed).toBe(true);
    expect(aggregate.capabilityLocks.canUseAiAssistant).toBe(true);
    expect(aggregate.capabilityLocks.canApplyAiPatch).toBe(true);
    expect(aggregate.capabilityLocks.canPublishEvent).toBe(false);
  });

  it('uses authoritative website, question, and add-on signals instead of synthetic placeholders', () => {
    const aggregate = buildEventWizardAggregate(
      buildEvent({
        startsAt: new Date('2026-03-15T13:00:00.000Z'),
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
            pricingTierCount: 1,
            hasBoundedPricingTier: false,
            registrationCount: 0,
          },
        ],
      }),
      {
        selectedPath: 'manual',
        hasWebsiteContent: true,
        questionCount: 1,
        addOnCount: 1,
      },
    );

    expect(aggregate.completionByStepId.website).toBe(true);
    expect(aggregate.completionByStepId.questions).toBe(true);
    expect(aggregate.completionByStepId.add_ons).toBe(true);
    expect(aggregate.setupStepStateById.content.completed).toBe(true);
    expect(aggregate.setupStepStateById.extras.completed).toBe(true);
  });

  it('marks extras incomplete and blocks review when an active add-on has zero active options', () => {
    const aggregate = buildEventWizardAggregate(
      buildEvent({
        startsAt: new Date('2026-03-15T13:00:00.000Z'),
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
            pricingTierCount: 1,
            hasBoundedPricingTier: false,
            registrationCount: 0,
          },
        ],
      }),
      {
        selectedPath: 'manual',
        addOnCount: 1,
        addOns: [
          {
            isActive: true,
            options: [],
          },
        ],
      },
    );

    expect(aggregate.completionByStepId.add_ons).toBe(false);
    expect(aggregate.setupStepStateById.extras.completed).toBe(false);
    expect(aggregate.setupStepStateById.extras.blockerCount).toBe(1);
    expect(aggregate.publishBlockers.map((issue) => issue.code)).toContain(
      'ACTIVE_ADD_ON_WITHOUT_OPTIONS',
    );
    expect(aggregate.publishBlockers.map((issue) => issue.labelKey)).toContain(
      'wizard.issues.publishActiveAddOnWithoutOptions',
    );
  });

  it('keeps valid active add-ons healthy in extras and review', () => {
    const aggregate = buildEventWizardAggregate(
      buildEvent({
        startsAt: new Date('2026-03-15T13:00:00.000Z'),
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
            pricingTierCount: 1,
            hasBoundedPricingTier: false,
            registrationCount: 0,
          },
        ],
      }),
      {
        selectedPath: 'manual',
        addOnCount: 1,
        addOns: [
          {
            isActive: true,
            options: [{ isActive: true }],
          },
        ],
      },
    );

    expect(aggregate.completionByStepId.add_ons).toBe(true);
    expect(aggregate.setupStepStateById.extras.completed).toBe(true);
    expect(aggregate.publishBlockers.map((issue) => issue.code)).not.toContain(
      'ACTIVE_ADD_ON_WITHOUT_OPTIONS',
    );
  });

  it('builds a basics-only diagnosis from the canonical basics fields', () => {
    const aggregate = buildEventWizardAggregate(
      buildEvent({
        startsAt: new Date('2026-03-15T13:00:00.000Z'),
        city: 'Ciudad de México',
        state: 'CDMX',
        description: 'Trail urbano de noche.',
        heroImageMediaId: null,
        heroImageUrl: null,
        endsAt: null,
      }),
      {
        selectedPath: 'manual',
      },
    );

    expect(aggregate.stepDiagnosisById?.basics?.map((issue) => issue.code)).toEqual([
      'MISSING_EVENT_END_DATE',
      'MISSING_HERO_IMAGE',
    ]);
  });

  it('marks required progress complete when path, details, distance, and pricing are complete', () => {
    const result = evaluateEventWizardCompleteness(
      buildEvent({
        startsAt: new Date('2026-03-15T13:00:00.000Z'),
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
            pricingTierCount: 1,
            hasBoundedPricingTier: false,
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
