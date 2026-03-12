import { z } from 'zod';

const wizardStepIds = [
  'basics',
  'distances',
  'pricing',
  'registration',
  'policies',
  'content',
  'extras',
  'review',
] as const;

export const eventAiWizardStepIdSchema = z.enum(wizardStepIds);

const questionTypeSchema = z.enum(['text', 'single_select', 'checkbox']);
const waiverSignatureTypeSchema = z.enum(['checkbox', 'initials', 'signature']);
const addOnTypeSchema = z.enum(['merch', 'donation']);
const addOnDeliveryMethodSchema = z.enum(['pickup', 'shipping', 'none']);
const websiteSectionSchema = z.enum(['overview', 'course', 'schedule']);
const policyKindSchema = z.enum(['refund', 'transfer', 'deferral']);

function hasPrice(data: { priceCents?: number; price?: number }): boolean {
  return data.priceCents !== undefined || data.price !== undefined;
}

// Keep schemas strict and allowlisted. Unknown keys must fail validation.

export const eventAiWizardUpdateEditionOpSchema = z
  .object({
    type: z.literal('update_edition'),
    editionId: z.string().uuid(),
    data: z
      .object({
        editionLabel: z.string().min(1).max(50).optional(),
        slug: z.string().min(2).max(100).optional(),
        description: z.string().max(5000).nullable().optional(),
        timezone: z.string().min(1).max(50).optional(),
        startsAt: z.string().nullable().optional(),
        endsAt: z.string().nullable().optional(),
        city: z.string().max(100).nullable().optional(),
        state: z.string().max(100).nullable().optional(),
        locationDisplay: z.string().max(255).nullable().optional(),
        address: z.string().max(500).nullable().optional(),
        latitude: z.string().nullable().optional(),
        longitude: z.string().nullable().optional(),
        externalUrl: z.string().url().max(500).nullable().optional(),
        registrationOpensAt: z.string().nullable().optional(),
        registrationClosesAt: z.string().nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const eventAiWizardCreateDistanceOpSchema = z
  .object({
    type: z.literal('create_distance'),
    editionId: z.string().uuid(),
    data: z
      .object({
        label: z.string().min(1).max(100),
        distanceValue: z.number().positive().optional(),
        distanceUnit: z.enum(['km', 'mi']).optional(),
        kind: z.enum(['distance', 'timed']).optional(),
        startTimeLocal: z.string().nullable().optional(),
        timeLimitMinutes: z.number().int().positive().nullable().optional(),
        terrain: z.enum(['road', 'trail', 'mixed']).nullable().optional(),
        isVirtual: z.boolean().optional(),
        capacity: z.number().int().positive().nullable().optional(),
        capacityScope: z.enum(['per_distance', 'shared_pool']).optional(),
        priceCents: z.number().int().min(0).optional(),
        price: z.number().min(0).optional(),
      })
      .strict()
      .refine(hasPrice, { message: 'priceCents or price is required' }),
  })
  .strict();

export const eventAiWizardUpdateDistancePriceOpSchema = z
  .object({
    type: z.literal('update_distance_price'),
    distanceId: z.string().uuid(),
    data: z
      .object({
        priceCents: z.number().int().min(0).optional(),
        price: z.number().min(0).optional(),
      })
      .strict()
      .refine(hasPrice, { message: 'priceCents or price is required' }),
  })
  .strict();

export const eventAiWizardCreatePricingTierOpSchema = z
  .object({
    type: z.literal('create_pricing_tier'),
    distanceId: z.string().uuid(),
    data: z
      .object({
        label: z.string().max(100).nullable().optional(),
        startsAt: z.string().nullable().optional(),
        endsAt: z.string().nullable().optional(),
        currency: z.string().length(3).optional(),
        priceCents: z.number().int().min(0).optional(),
        price: z.number().min(0).optional(),
      })
      .strict()
      .refine(hasPrice, { message: 'priceCents or price is required' }),
  })
  .strict();

export const eventAiWizardCreateFaqItemOpSchema = z
  .object({
    type: z.literal('create_faq_item'),
    editionId: z.string().uuid(),
    data: z
      .object({
        question: z.string().min(1).max(500),
        answerMarkdown: z.string().min(1).max(10000),
      })
      .strict(),
  })
  .strict();

export const eventAiWizardCreateWaiverOpSchema = z
  .object({
    type: z.literal('create_waiver'),
    editionId: z.string().uuid(),
    data: z
      .object({
        title: z.string().min(1).max(255),
        bodyMarkdown: z.string().min(1).max(20000),
        signatureType: waiverSignatureTypeSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const eventAiWizardCreateQuestionOpSchema = z
  .object({
    type: z.literal('create_question'),
    editionId: z.string().uuid(),
    data: z
      .object({
        distanceId: z.string().uuid().nullable().optional(),
        type: questionTypeSchema,
        prompt: z.string().min(1).max(500),
        helpTextMarkdown: z.string().max(500).nullable().optional(),
        isRequired: z.boolean().optional(),
        options: z.array(z.string().min(1).max(100)).nullable().optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      })
      .strict()
      .refine(
        (value) => value.type !== 'single_select' || (Array.isArray(value.options) && value.options.length >= 2),
        {
          message: 'Single select questions must have at least 2 options',
          path: ['options'],
        },
      ),
  })
  .strict();

export const eventAiWizardCreateAddOnOpSchema = z
  .object({
    type: z.literal('create_add_on'),
    editionId: z.string().uuid(),
    data: z
      .object({
        distanceId: z.string().uuid().nullable().optional(),
        title: z.string().min(1).max(255),
        descriptionMarkdown: z.string().max(1000).nullable().optional(),
        type: addOnTypeSchema.optional(),
        deliveryMethod: addOnDeliveryMethodSchema.optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        optionLabel: z.string().min(1).max(100).optional(),
        optionPriceCents: z.number().int().min(0).optional(),
        optionPrice: z.number().min(0).optional(),
        optionMaxQtyPerOrder: z.number().int().min(1).max(10).optional(),
      })
      .strict()
      .refine(
        (value) =>
          value.optionPriceCents !== undefined || value.optionPrice !== undefined,
        { message: 'optionPriceCents or optionPrice is required' },
      ),
  })
  .strict();

export const eventAiWizardAppendWebsiteSectionOpSchema = z
  .object({
    type: z.literal('append_website_section_markdown'),
    editionId: z.string().uuid(),
    data: z
      .object({
        section: websiteSectionSchema,
        markdown: z.string().min(1).max(10000),
        title: z.string().max(255).optional(),
        locale: z.string().min(2).max(10).optional(),
      })
      .strict(),
  })
  .strict();

export const eventAiWizardAppendPolicyOpSchema = z
  .object({
    type: z.literal('append_policy_markdown'),
    editionId: z.string().uuid(),
    data: z
      .object({
        policy: policyKindSchema,
        markdown: z.string().min(1).max(5000),
        enable: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const eventAiWizardOpSchema = z.discriminatedUnion('type', [
  eventAiWizardUpdateEditionOpSchema,
  eventAiWizardCreateDistanceOpSchema,
  eventAiWizardUpdateDistancePriceOpSchema,
  eventAiWizardCreatePricingTierOpSchema,
  eventAiWizardCreateFaqItemOpSchema,
  eventAiWizardCreateWaiverOpSchema,
  eventAiWizardCreateQuestionOpSchema,
  eventAiWizardCreateAddOnOpSchema,
  eventAiWizardAppendWebsiteSectionOpSchema,
  eventAiWizardAppendPolicyOpSchema,
]);

export type EventAiWizardOp = z.infer<typeof eventAiWizardOpSchema>;

export const eventAiWizardMissingFieldItemSchema = z
  .object({
    code: z.string().min(1).max(80),
    stepId: eventAiWizardStepIdSchema,
    label: z.string().min(1).max(240),
    severity: z.enum(['required', 'blocker', 'optional']).optional(),
  })
  .strict();

export type EventAiWizardMissingFieldItem = z.infer<typeof eventAiWizardMissingFieldItemSchema>;

export const eventAiWizardIntentRouteSchema = z
  .object({
    intent: z.string().min(1).max(120),
    stepId: eventAiWizardStepIdSchema,
    rationale: z.string().min(1).max(240).optional(),
  })
  .strict();

export type EventAiWizardIntentRoute = z.infer<typeof eventAiWizardIntentRouteSchema>;

const markdownOutputDomainValues = [
  'description',
  'faq',
  'waiver',
  'website',
  'question',
  'add_on',
  'policy',
] as const;

export const eventAiWizardMarkdownOutputSchema = z
  .object({
    domain: z.enum(markdownOutputDomainValues),
    title: z.string().max(120).optional(),
    contentMarkdown: z.string().min(1).max(10000),
  })
  .strict();

export type EventAiWizardMarkdownOutput = z.infer<typeof eventAiWizardMarkdownOutputSchema>;

type ExpectedMarkdownOutput = Pick<EventAiWizardMarkdownOutput, 'domain' | 'contentMarkdown'>;

function collectExpectedMarkdownOutputs(ops: EventAiWizardOp[]): ExpectedMarkdownOutput[] {
  return ops.flatMap((op): ExpectedMarkdownOutput[] => {
    switch (op.type) {
      case 'update_edition':
        return op.data.description ? [{ domain: 'description', contentMarkdown: op.data.description }] : [];
      case 'create_faq_item':
        return [{ domain: 'faq', contentMarkdown: op.data.answerMarkdown }];
      case 'create_waiver':
        return [{ domain: 'waiver', contentMarkdown: op.data.bodyMarkdown }];
      case 'create_question':
        return op.data.helpTextMarkdown
          ? [{ domain: 'question', contentMarkdown: op.data.helpTextMarkdown }]
          : [];
      case 'create_add_on':
        return op.data.descriptionMarkdown
          ? [{ domain: 'add_on', contentMarkdown: op.data.descriptionMarkdown }]
          : [];
      case 'append_website_section_markdown':
        return [{ domain: 'website', contentMarkdown: op.data.markdown }];
      case 'append_policy_markdown':
        return [{ domain: 'policy', contentMarkdown: op.data.markdown }];
      default:
        return [];
    }
  });
}

function toOutputKey(output: ExpectedMarkdownOutput): string {
  return `${output.domain}::${output.contentMarkdown}`;
}

export const eventAiWizardPatchSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    ops: z.array(eventAiWizardOpSchema).min(1).max(40),
    risky: z.boolean().optional(),
    missingFieldsChecklist: z.array(eventAiWizardMissingFieldItemSchema).max(30).optional(),
    intentRouting: z.array(eventAiWizardIntentRouteSchema).max(30).optional(),
    markdownOutputs: z.array(eventAiWizardMarkdownOutputSchema).max(30).optional(),
  })
  .strict()
  .superRefine((patch, ctx) => {
    const expectedOutputs = collectExpectedMarkdownOutputs(patch.ops);
    const providedOutputs = patch.markdownOutputs ?? [];

    if (expectedOutputs.length === 0) {
      if (providedOutputs.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['markdownOutputs'],
          message: 'markdownOutputs are only allowed when the patch writes markdown-bearing fields',
        });
      }
      return;
    }

    if (providedOutputs.length !== expectedOutputs.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['markdownOutputs'],
        message: 'markdownOutputs must mirror each markdown-bearing operation exactly',
      });
      return;
    }

    const expectedKeys = expectedOutputs.map(toOutputKey).sort();
    const providedKeys = providedOutputs
      .map((output) => toOutputKey({ domain: output.domain, contentMarkdown: output.contentMarkdown }))
      .sort();

    for (let index = 0; index < expectedKeys.length; index += 1) {
      if (expectedKeys[index] !== providedKeys[index]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['markdownOutputs'],
          message: 'markdownOutputs must match the exact markdown content written by the patch',
        });
        return;
      }
    }
  });

export type EventAiWizardPatch = z.infer<typeof eventAiWizardPatchSchema>;

export const eventAiWizardApplyRequestSchema = z
  .object({
    editionId: z.string().uuid(),
    locale: z.string().min(2).max(10).optional(),
    patch: eventAiWizardPatchSchema,
  })
  .strict();

export type EventAiWizardApplyRequest = z.infer<typeof eventAiWizardApplyRequestSchema>;
