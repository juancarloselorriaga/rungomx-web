import { eventAiWizardPatchSchema } from '@/lib/events/ai-wizard/schemas';

const EDITION_ID = '68ca6035-7c0f-4ff6-b3c2-651f81e5a8a4';
const DISTANCE_ID = '8acb5f42-f2ff-4494-a56a-d149a0c04444';

describe('ai wizard patch schema', () => {
  it('accepts expanded append-only ops and routing payloads', () => {
    const parsed = eventAiWizardPatchSchema.safeParse({
      title: 'Expand event setup',
      summary: 'Add FAQ, policy text, and route next steps',
      ops: [
        {
          type: 'create_faq_item',
          editionId: EDITION_ID,
          data: {
            question: 'Where is packet pickup?',
            answerMarkdown: 'Packet pickup is available on Friday from 4-8 PM.',
          },
        },
        {
          type: 'create_question',
          editionId: EDITION_ID,
          data: {
            distanceId: DISTANCE_ID,
            type: 'single_select',
            prompt: 'Preferred shirt size',
            options: ['S', 'M', 'L'],
          },
        },
        {
          type: 'append_website_section_markdown',
          editionId: EDITION_ID,
          data: {
            section: 'overview',
            markdown: '## Event Overview\nA fast and scenic race day experience.',
          },
        },
      ],
      missingFieldsChecklist: [
        {
          code: 'MISSING_PRICING',
          stepId: 'pricing',
          label: 'Add at least one pricing tier for each distance.',
          severity: 'blocker',
        },
        {
          code: 'RECOMMEND_FAQ',
          stepId: 'content',
          label: 'Add FAQ copy for common participant questions.',
          severity: 'optional',
        },
      ],
      intentRouting: [
        {
          intent: 'Add early bird pricing',
          stepId: 'pricing',
          rationale: 'Pricing tiers are still incomplete.',
        },
      ],
      markdownOutputs: [
        {
          domain: 'faq',
          title: 'Packet pickup answer',
          contentMarkdown: 'Packet pickup is available on Friday from 4-8 PM.',
        },
        {
          domain: 'website',
          title: 'Overview copy',
          contentMarkdown: '## Event Overview\nA fast and scenic race day experience.',
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects unknown fields in op payloads', () => {
    const parsed = eventAiWizardPatchSchema.safeParse({
      title: 'Invalid op payload',
      summary: 'Schema must reject unknown keys',
      ops: [
        {
          type: 'create_faq_item',
          editionId: EDITION_ID,
          data: {
            question: 'Q',
            answerMarkdown: 'A',
            unexpectedField: 'not-allowlisted',
          },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it('drops ambiguous clock-only start times from distance ops', () => {
    const parsed = eventAiWizardPatchSchema.safeParse({
      title: 'Create first distance',
      summary: 'Add the first published distance proposal.',
      ops: [
        {
          type: 'create_distance',
          editionId: EDITION_ID,
          data: {
            label: '10K',
            distanceValue: 10,
            distanceUnit: 'km',
            startTimeLocal: '7:00 a.m.',
            price: 350,
          },
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(JSON.stringify(parsed.data)).not.toContain('startTimeLocal');
    expect(parsed.data.ops[0]).toMatchObject({
      type: 'create_distance',
      data: {
        label: '10K',
        distanceValue: 10,
        distanceUnit: 'km',
        price: 350,
      },
    });
  });

  it('preserves valid machine-usable distance start times', () => {
    const parsed = eventAiWizardPatchSchema.safeParse({
      title: 'Create first distance',
      summary: 'Add the first published distance proposal.',
      ops: [
        {
          type: 'create_distance',
          editionId: EDITION_ID,
          data: {
            label: '21K',
            distanceValue: 21,
            distanceUnit: 'km',
            startTimeLocal: '2026-03-29T13:00:00.000Z',
            price: 550,
          },
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.ops[0]).toMatchObject({
      type: 'create_distance',
      data: {
        label: '21K',
        startTimeLocal: '2026-03-29T13:00:00.000Z',
      },
    });
  });

  it('rejects invalid step ids in intent routing payloads', () => {
    const parsed = eventAiWizardPatchSchema.safeParse({
      title: 'Invalid step route',
      summary: 'Routing payload should use canonical step ids',
      ops: [
        {
          type: 'create_faq_item',
          editionId: EDITION_ID,
          data: {
            question: 'How long is the route?',
            answerMarkdown: '10K total distance.',
          },
        },
      ],
      intentRouting: [
        {
          intent: 'Go to unknown step',
          stepId: 'core.details',
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects markdown previews that do not exactly match markdown-bearing ops', () => {
    const parsed = eventAiWizardPatchSchema.safeParse({
      title: 'Invalid markdown preview',
      summary: 'Preview must match what apply writes',
      ops: [
        {
          type: 'create_faq_item',
          editionId: EDITION_ID,
          data: {
            question: 'Where is packet pickup?',
            answerMarkdown: 'Packet pickup is available on Friday from 4-8 PM.',
          },
        },
      ],
      markdownOutputs: [
        {
          domain: 'faq',
          title: 'FAQ answer',
          contentMarkdown: 'Packet pickup is available all weekend.',
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});
