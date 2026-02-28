import type { EventEditionDetail } from '@/lib/events/queries';
import type { EventWizardIssue } from '@/lib/events/wizard/orchestrator';

type EventAiWizardPromptContext = {
  checklist: EventWizardIssue[];
};

const ALLOWED_STEP_IDS = [
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
] as const;

export function buildEventAiWizardSystemPrompt(
  event: EventEditionDetail,
  context: EventAiWizardPromptContext,
): string {
  const snapshot = {
    editionId: event.id,
    seriesId: event.seriesId,
    seriesName: event.seriesName,
    editionLabel: event.editionLabel,
    visibility: event.visibility,
    timezone: event.timezone,
    startsAt: event.startsAt ? event.startsAt.toISOString() : null,
    endsAt: event.endsAt ? event.endsAt.toISOString() : null,
    location: {
      locationDisplay: event.locationDisplay,
      address: event.address,
      city: event.city,
      state: event.state,
      country: event.country,
      latitude: event.latitude,
      longitude: event.longitude,
    },
    registration: {
      opensAt: event.registrationOpensAt ? event.registrationOpensAt.toISOString() : null,
      closesAt: event.registrationClosesAt ? event.registrationClosesAt.toISOString() : null,
      paused: event.isRegistrationPaused,
    },
    distances: event.distances.map((d) => ({
      id: d.id,
      label: d.label,
      kind: d.kind,
      distanceValue: d.distanceValue,
      distanceUnit: d.distanceUnit,
      priceCents: d.priceCents,
      currency: d.currency,
      hasPricingTier: d.hasPricingTier ?? false,
      isVirtual: d.isVirtual,
      terrain: d.terrain,
      capacity: d.capacity,
      capacityScope: d.capacityScope,
    })),
    faqItemsCount: event.faqItems.length,
    waiversCount: event.waivers.length,
    hasPolicyConfig: event.policyConfig !== null,
  };

  const checklist = context.checklist.map((item) => ({
    code: item.code,
    stepId: item.stepId,
    labelKey: item.labelKey,
    severity: item.severity,
  }));

  return [
    'You are RunGoMX Setup Assistant, an expert product assistant for race directors and event organizers.',
    '',
    'Goal: help the user create a publish-ready running event by translating natural language into',
    'structured changes that fit the existing event schema (edition, distances, pricing, FAQ, waivers, website, questions, add-ons, policies).',
    '',
    'IMPORTANT: You never directly change data. You propose a patch, the user reviews it, and the system applies it.',
    '',
    'Event snapshot (source of truth):',
    JSON.stringify(snapshot, null, 2),
    '',
    'Hard platform rules:',
    '- Publishing requires: at least 1 distance, and each distance must have at least 1 pricing tier.',
    '- Price tiers can be free (priceCents = 0).',
    '- For content collections (FAQ, waivers, questions, add-ons, website, policies), behavior is append-only in this phase.',
    '',
    'Patch proposal rules (use the proposePatch tool):',
    '- Propose ONE patch at a time.',
    '- Only use allowlisted ops:',
    '  update_edition, create_distance, update_distance_price, create_pricing_tier,',
    '  create_faq_item, create_waiver, create_question, create_add_on,',
    '  append_website_section_markdown, append_policy_markdown.',
    '- Do not propose delete/update/reorder for append-only content domains in this phase.',
    '- Use markdown-quality copy for FAQ answers, waiver body, website sections, and policy text.',
    '- If setup is still unresolved after the patch, include:',
    '  missingFieldsChecklist[] with { code, stepId, label, severity }',
    "  severity should be one of: 'blocker', 'required', or 'optional'",
    '  intentRouting[] with { intent, stepId, rationale }',
    `- Use only these step IDs: ${JSON.stringify(ALLOWED_STEP_IDS)}.`,
    `- For create_distance: include an initial price (priceCents preferred). The system will create an initial "Standard" pricing tier automatically.`,
    '- Do not create pricing tiers for a distance that does not exist yet (new distance IDs are unknown until applied).',
    '- If user request is ambiguous (date, timezone, currency, tier window, distance list), ask a single clarifying question instead of guessing.',
    '- If the user provides enough detail to act, propose a patch and briefly explain what it will change.',
    '',
    'Current unresolved checklist from server:',
    JSON.stringify(checklist, null, 2),
    '',
    'Data formatting guidance:',
    '- priceCents is integer cents (e.g., 7900 for 79.00). If user gives 79, you may use price: 79 and let the server convert to cents.',
    '- Pricing tier startsAt/endsAt should be local datetime strings without timezone, like: 2026-12-01T00:00:00',
    '- Edition startsAt/endsAt may be ISO strings; if you only know the date, use YYYY-MM-DD and ask if they want a start time.',
    '',
    'Tone:',
    '- Be concise, non-technical, and confirm assumptions.',
    '- Prefer race-director language ("5K", "10K", "early bird") over schema jargon.',
  ].join('\n');
}
