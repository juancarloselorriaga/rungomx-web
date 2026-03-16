import {
  buildEventAiWizardSystemPrompt,
  resolveEventAiWizardSharedBrief,
} from '@/lib/events/ai-wizard/prompt';
import type { EventEditionDetail } from '@/lib/events/queries';

function buildEvent(overrides?: Partial<EventEditionDetail>): EventEditionDetail {
  return {
    id: 'event-123',
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

describe('event ai wizard prompt', () => {
  it('prefers the persisted organizer brief over the client session brief', () => {
    const event = buildEvent({
      organizerBrief: 'Persisted organizer brief',
    });

    expect(
      resolveEventAiWizardSharedBrief(event, {
        eventBrief: 'Client session brief',
      }),
    ).toBe('Persisted organizer brief');

    const prompt = buildEventAiWizardSystemPrompt(event, {
      activeStepId: 'basics',
      checklist: [],
      eventBrief: 'Client session brief',
    });

    expect(prompt).toContain('Persisted organizer brief');
    expect(prompt).not.toContain('Client session brief');
  });

  it('falls back to the session brief when no persisted organizer brief exists', () => {
    const event = buildEvent();
    const prompt = buildEventAiWizardSystemPrompt(event, {
      activeStepId: 'content',
      checklist: [],
      eventBrief: 'Session-only organizer brief',
    });

    expect(resolveEventAiWizardSharedBrief(event, { eventBrief: 'Session-only organizer brief' })).toBe(
      'Session-only organizer brief',
    );
    expect(prompt).toContain('Session-only organizer brief');
  });

  it('adds explicit grounding and anti-invention guidance for markdown-heavy steps', () => {
    const event = buildEvent({
      organizerBrief: 'Boutique trail half marathon with elegant tone',
      locationDisplay: 'Bosque La Primavera, Guadalajara',
      description: 'Existing event description',
      distances: [
        {
          id: 'distance-1',
          label: '21K',
          kind: 'distance',
          distanceValue: '21',
          distanceUnit: 'km',
          terrain: 'trail',
          isVirtual: false,
          capacity: null,
          capacityScope: 'per_distance',
          priceCents: 95000,
          currency: 'MXN',
          hasPricingTier: true,
          pricingTierCount: 1,
          hasBoundedPricingTier: false,
          startTimeLocal: null,
          timeLimitMinutes: null,
          sortOrder: 0,
          registrationCount: 0,
        },
      ],
    });

    const prompt = buildEventAiWizardSystemPrompt(event, {
      activeStepId: 'content',
      checklist: [
        {
          code: 'MISSING_BASICS',
          stepId: 'basics',
          labelKey: 'wizard.issues.missingEventDate',
          severity: 'required',
        },
        {
          code: 'MISSING_DISTANCES',
          stepId: 'distances',
          labelKey: 'wizard.issues.missingDistance',
          severity: 'required',
        },
      ],
      locale: 'en',
      websiteContent: {
        overview: {
          type: 'overview',
          enabled: true,
          title: 'About the race',
          content: 'Steep climbs, forest shade, and a sunrise start.',
        },
        course: {
          type: 'course',
          enabled: true,
          title: 'Course notes',
          description: 'Singletrack climbs with technical descents.',
        },
      },
      eventBrief: null,
    });

    expect(prompt).toContain('Grounding and anti-generic rules:');
    expect(prompt).toContain('Current wizard locale is "en". Write participant-facing copy in English');
    expect(prompt).toContain('Localized website content already saved for this locale:');
    expect(prompt).toContain('Basics are still incomplete. Do not invent event dates');
    expect(prompt).toContain('Distances are still incomplete. Do not mention a 5K, 10K, 21K');
    expect(prompt).toContain('About the race');
    expect(prompt).toContain('Singletrack climbs with technical descents.');
    expect(prompt).toContain('Bosque La Primavera, Guadalajara');
    expect(prompt).toContain('Distances already configured: 21K.');
    expect(prompt).toContain('Never invent sponsors, aid stations, medals, shirts, parking, packet pickup, awards, entertainment, amenities, logistics, premium lounges, photography services, swag, or recovery zones');
    expect(prompt).toContain('Do not infer safety coverage, first aid, checkpoints, awards, parking plans, or exact pickup venues');
    expect(prompt).toContain('If the organizer gives rough notes, first normalize them into a short list of confirmed facts and constraints');
    expect(prompt).toContain('When the organizer says not to invent or not to promise something, treat that as a strict instruction');
    expect(prompt).toContain('Avoid generic AI filler such as "unforgettable experience", "something for everyone", "world-class event"');
    expect(prompt).toContain('Do not paste the full markdown draft into normal assistant prose.');
    expect(prompt).toContain('Never emit translation keys such as "wizard.issues.*"');
  });

  it('treats short organizer requests as plain-language intents and keeps markdown rules hidden in the system prompt', () => {
    const prompt = buildEventAiWizardSystemPrompt(
      buildEvent({
        organizerBrief: 'Elegant city half marathon for ambitious first-timers',
      }),
      {
        activeStepId: 'content',
        checklist: [],
        locale: 'es',
        eventBrief: null,
      },
    );

    expect(prompt).toContain('Organizers are not expected to write prompt-engineering instructions.');
    expect(prompt).toContain('Infer the practical organizer goal from the request');
    expect(prompt).toContain('Never ask the organizer to explain how the assistant should behave');
    expect(prompt).toContain('If the organizer message is rough, fragmentary, or pasted notes');
    expect(prompt).toContain('A shared organizer brief is available. Reuse it automatically');
    expect(prompt).toContain(
      'For this step, default to publish-ready participant-facing markdown when drafting copy',
    );
    expect(prompt).toContain(
      'For copy-heavy steps, turn rough notes into polished, renderer-friendly markdown',
    );
    expect(prompt).toContain(
      'grounded omission is better than polished invention',
    );
  });

  it('biases copy-heavy broad prompts toward a first-pass proposal', () => {
    const prompt = buildEventAiWizardSystemPrompt(
      buildEvent({
        organizerBrief: 'Trail race in Valle de Bravo with premium but grounded tone',
        locationDisplay: 'Valle de Bravo',
        description: 'Existing draft description',
      }),
      {
        activeStepId: 'content',
        checklist: [],
        locale: 'es',
      },
    );

    expect(prompt).toContain('First-response policy:');
    expect(prompt).toContain(
      'Broad organizer requests such as "ayúdame con esto", "redacta la descripción", "prepara FAQ", or "organiza estas notas" should usually result in a proposal-first response, not a clarifying question.',
    );
    expect(prompt).toContain(
      'For copy-heavy steps, prefer a first-pass proposal even when the organizer notes are rough',
    );
    expect(prompt).toContain(
      'surface the omission or pending confirmation inside the proposal itself instead of stalling the organizer.',
    );
  });

  it('supports a compact accelerated prompt mode for fast-path copy-heavy requests', () => {
    const prompt = buildEventAiWizardSystemPrompt(
      buildEvent({
        organizerBrief: 'Premium but grounded trail event',
        locationDisplay: 'Valle de Bravo',
      }),
      {
        activeStepId: 'content',
        checklist: [],
        locale: 'es',
        fastPathKind: 'faq',
        compactMode: true,
      },
    );

    expect(prompt).toContain('Goal: move quickly to one grounded, reviewable patch for the active wizard step.');
    expect(prompt).toContain('Fast-path focus:');
    expect(prompt).toContain('faq');
    expect(prompt).toContain('Saved localized website content:');
    expect(prompt).toContain('Use only allowlisted ops.');
    expect(prompt).not.toContain('Grounding and anti-generic rules:');
  });

  it('includes persisted structured schedule and core location truth in the compact snapshot', () => {
    const prompt = buildEventAiWizardSystemPrompt(
      buildEvent({
        startsAt: new Date('2026-03-15T06:00:00.000Z'),
        endsAt: new Date('2026-03-15T14:00:00.000Z'),
        timezone: 'America/Mexico_City',
        locationDisplay: 'Bosque de Chapultepec',
        address: 'Av. Paseo de la Reforma',
        city: 'Ciudad de México',
        state: 'CDMX',
        latitude: '19.4204',
        longitude: '-99.1819',
      }),
      {
        activeStepId: 'review',
        checklist: [],
        locale: 'es',
        fastPathKind: 'website_overview',
        compactMode: true,
      },
    );

    expect(prompt).toContain('"startsAt":"2026-03-15T06:00:00.000Z"');
    expect(prompt).toContain('"endsAt":"2026-03-15T14:00:00.000Z"');
    expect(prompt).toContain('"timezone":"America/Mexico_City"');
    expect(prompt).toContain('"locationDisplay":"Bosque de Chapultepec"');
    expect(prompt).toContain('"address":"Av. Paseo de la Reforma"');
    expect(prompt).toContain('"latitude":"19.4204"');
    expect(prompt).toContain('"longitude":"-99.1819"');
  });

  it('grounds participant-facing schedule in local event time instead of defaulting to UTC phrasing', () => {
    const prompt = buildEventAiWizardSystemPrompt(
      buildEvent({
        startsAt: new Date('2026-10-12T13:00:00.000Z'),
        endsAt: new Date('2026-10-12T19:00:00.000Z'),
        timezone: 'America/Mexico_City',
      }),
      {
        activeStepId: 'content',
        checklist: [],
        locale: 'en',
      },
    );

    expect(prompt).toContain(
      'Participant-facing local schedule is known: October 12, 2026 from 7:00 AM to 1:00 PM (America/Mexico_City).',
    );
    expect(prompt).toContain(
      'When the event timezone is known, describe participant-facing schedule details in local event time, not as UTC or raw ISO timestamps, unless the organizer explicitly asks for UTC.',
    );
    expect(prompt).not.toContain('Structured event schedule is known: startsAt 2026-10-12T13:00:00.000Z');
  });

  it('reserves clarify-first behavior for structural operational gaps', () => {
    const prompt = buildEventAiWizardSystemPrompt(buildEvent(), {
      activeStepId: 'pricing',
      checklist: [],
      locale: 'es',
    });

    expect(prompt).toContain(
      'For distances, pricing, and registration, clarify first only when the organizer is asking for specific operational structure that cannot be proposed safely from the current snapshot, for example an unknown distance lineup, currency, timezone, or tier window.',
    );
    expect(prompt).toContain(
      'Use a clarifying question first only when the organizer is asking for a concrete date, timezone, currency, tier window, or distance lineup that is not already grounded in the snapshot or shared brief.',
    );
    expect(prompt).toContain(
      'If no tier timeline is provided, use a conservative fallback structure or ask one clarifying question only when the organizer is explicitly asking for dated windows.',
    );
  });
});
