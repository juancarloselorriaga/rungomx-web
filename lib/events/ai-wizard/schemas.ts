import { z } from 'zod';

// Keep schemas intentionally small and allowlisted. The assistant can suggest values,
// but only these ops can be applied server-side.

const priceInputSchema = z
  .object({
    // Preferred: integer cents (e.g. 7900 for $79.00)
    priceCents: z.number().int().min(0).optional(),
    // Fallback: currency units (e.g. 79.0)
    price: z.number().min(0).optional(),
  })
  .refine((data) => data.priceCents !== undefined || data.price !== undefined, {
    message: 'priceCents or price is required',
  });

export const eventAiWizardUpdateEditionOpSchema = z.object({
  type: z.literal('update_edition'),
  editionId: z.string().uuid(),
  data: z.object({
    editionLabel: z.string().min(1).max(50).optional(),
    slug: z.string().min(2).max(100).optional(),
    description: z.string().max(5000).nullable().optional(),
    timezone: z.string().min(1).max(50).optional(),
    startsAt: z.string().nullable().optional(), // date or datetime; normalized server-side
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
  }),
});

export const eventAiWizardCreateDistanceOpSchema = z.object({
  type: z.literal('create_distance'),
  editionId: z.string().uuid(),
  data: z
    .object({
      label: z.string().min(1).max(100),
      distanceValue: z.number().positive().optional(),
      distanceUnit: z.enum(['km', 'mi']).optional(),
      kind: z.enum(['distance', 'timed']).optional(),
      startTimeLocal: z.string().nullable().optional(), // date or datetime; normalized server-side
      timeLimitMinutes: z.number().int().positive().nullable().optional(),
      terrain: z.enum(['road', 'trail', 'mixed']).nullable().optional(),
      isVirtual: z.boolean().optional(),
      capacity: z.number().int().positive().nullable().optional(),
      capacityScope: z.enum(['per_distance', 'shared_pool']).optional(),
    })
    .and(priceInputSchema),
});

export const eventAiWizardUpdateDistancePriceOpSchema = z.object({
  type: z.literal('update_distance_price'),
  distanceId: z.string().uuid(),
  data: priceInputSchema,
});

export const eventAiWizardCreatePricingTierOpSchema = z.object({
  type: z.literal('create_pricing_tier'),
  distanceId: z.string().uuid(),
  data: z
    .object({
      label: z.string().max(100).nullable().optional(),
      startsAt: z.string().nullable().optional(),
      endsAt: z.string().nullable().optional(),
      currency: z.string().length(3).optional(),
    })
    .and(priceInputSchema),
});

export const eventAiWizardOpSchema = z.discriminatedUnion('type', [
  eventAiWizardUpdateEditionOpSchema,
  eventAiWizardCreateDistanceOpSchema,
  eventAiWizardUpdateDistancePriceOpSchema,
  eventAiWizardCreatePricingTierOpSchema,
]);

export type EventAiWizardOp = z.infer<typeof eventAiWizardOpSchema>;

export const eventAiWizardPatchSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(400),
  ops: z.array(eventAiWizardOpSchema).min(1).max(25),
  risky: z.boolean().optional(),
});

export type EventAiWizardPatch = z.infer<typeof eventAiWizardPatchSchema>;

export const eventAiWizardApplyRequestSchema = z.object({
  editionId: z.string().uuid(),
  patch: eventAiWizardPatchSchema,
});

export type EventAiWizardApplyRequest = z.infer<typeof eventAiWizardApplyRequestSchema>;
