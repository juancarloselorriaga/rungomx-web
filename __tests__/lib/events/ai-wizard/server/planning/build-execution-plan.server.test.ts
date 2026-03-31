import { buildExecutionPlan } from '@/lib/events/ai-wizard/server/planning/build-execution-plan';
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

describe('buildExecutionPlan', () => {
  it('routes a basics FAQ ask into the content fast path', () => {
    const plan = buildExecutionPlan({
      event: buildEvent(),
      stepId: 'basics',
      locale: 'es',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          parts: [
            { type: 'text', text: 'Crea FAQ para participantes con lo que ya sabes del evento.' },
          ],
        },
      ],
    });

    expect(plan.mode).toBe('fast_path_generation');
    expect(plan.crossStepIntent).toMatchObject({
      sourceStepId: 'basics',
      primaryTargetStepId: 'content',
      intentType: 'faq',
    });
    expect(plan.fastPathKind).toBe('faq');
    expect(plan.modelPlan.stepBudget).toBe(4);
    expect(plan.modelPlan.forcedTool).toBe('proposeFaqPatch');
  });

  it('forces deterministic policies follow-up when multiple policy kinds are requested', () => {
    const plan = buildExecutionPlan({
      event: buildEvent(),
      stepId: 'policies',
      locale: 'es',
      messages: [
        {
          id: 'msg-2',
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'Define reembolsos y transferencias para participantes con fechas claras.',
            },
          ],
        },
      ],
    });

    expect(plan.fastPathKind).toBeNull();
    expect(plan.mode).toBe('deterministic_follow_up');
    expect(plan.deterministicHandler).toBe('policies_follow_up');
  });

  it('keeps generic refinements on the prior content bundle fast path', () => {
    const plan = buildExecutionPlan({
      event: buildEvent(),
      stepId: 'content',
      locale: 'es',
      messages: [
        {
          id: 'msg-user',
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'Agrega FAQ para participantes y un resumen del sitio usando solo lo ya confirmado.',
            },
          ],
        },
        {
          id: 'msg-assistant',
          role: 'assistant',
          parts: [
            {
              type: 'data-fast-path-structure',
              data: {
                kind: 'content_bundle',
                sectionKeys: ['faq_answers', 'website_summary', 'confirmed_boundaries'],
              },
            },
            {
              type: 'data-event-patch',
              data: {
                title: 'Bundle inicial',
                summary: 'Incluye FAQ y resumen del sitio.',
                ops: [],
                markdownOutputs: [],
              },
            },
          ],
        },
        {
          id: 'msg-refine',
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'Hazlo más claro y confiable, usando solo lo ya confirmado.',
            },
          ],
        },
      ],
    });

    expect(plan.fastPathKind).toBe('content_bundle');
    expect(plan.mode).toBe('fast_path_generation');
    expect(plan.modelPlan.stepBudget).toBe(4);
  });
});
