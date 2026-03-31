import { buildEventWizardAggregate } from '@/lib/events/wizard/orchestrator';

import type { EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';
import type { EventDistanceDetail, EventEditionDetail } from '@/lib/events/queries';

import { projectWebsiteContent } from './project-website-content';

export type ProposalProjectionAggregateInput = Parameters<typeof buildEventWizardAggregate>[1];

type DistancePricingProjection = {
  latestPriceCents?: number;
  updatePriceCount: number;
  createdPricingTierCount: number;
};

function resolveProjectedPriceCents(data: { priceCents?: number; price?: number }) {
  if (data.priceCents !== undefined) return data.priceCents;
  if (data.price !== undefined) return Math.round(data.price * 100);
  return undefined;
}

function buildDistancePricingProjectionById(patch: EventAiWizardPatch) {
  const projections = new Map<string, DistancePricingProjection>();

  for (const op of patch.ops) {
    if (op.type === 'update_distance_price') {
      const existing = projections.get(op.distanceId) ?? {
        updatePriceCount: 0,
        createdPricingTierCount: 0,
      };
      existing.updatePriceCount += 1;
      existing.latestPriceCents = resolveProjectedPriceCents(op.data);
      projections.set(op.distanceId, existing);
      continue;
    }

    if (op.type === 'create_pricing_tier') {
      const existing = projections.get(op.distanceId) ?? {
        updatePriceCount: 0,
        createdPricingTierCount: 0,
      };
      existing.createdPricingTierCount += 1;
      projections.set(op.distanceId, existing);
    }
  }

  return projections;
}

function projectExistingDistances(
  event: EventEditionDetail,
  patch: EventAiWizardPatch,
): EventDistanceDetail[] {
  const pricingProjectionById = buildDistancePricingProjectionById(patch);

  return event.distances.map((distance) => {
    const pricingProjection = pricingProjectionById.get(distance.id);
    if (!pricingProjection) {
      return distance;
    }

    const nextPricingTierCount =
      pricingProjection.createdPricingTierCount > 0
        ? distance.pricingTierCount + pricingProjection.createdPricingTierCount
        : pricingProjection.updatePriceCount > 0
          ? Math.max(distance.pricingTierCount, 1)
          : distance.pricingTierCount;

    return {
      ...distance,
      priceCents: pricingProjection.latestPriceCents ?? distance.priceCents,
      hasPricingTier: true,
      pricingTierCount: nextPricingTierCount,
      hasBoundedPricingTier:
        pricingProjection.createdPricingTierCount > 0 ? true : distance.hasBoundedPricingTier,
    };
  });
}

function projectCreatedDistances(
  event: EventEditionDetail,
  patch: EventAiWizardPatch,
): EventDistanceDetail[] {
  const defaultCurrency = event.distances[0]?.currency ?? 'MXN';

  return patch.ops
    .filter(
      (op): op is Extract<EventAiWizardPatch['ops'][number], { type: 'create_distance' }> =>
        op.type === 'create_distance',
    )
    .map((op, index) => ({
      id: `projected-distance-${index}`,
      label: op.data.label,
      distanceValue: op.data.distanceValue !== undefined ? String(op.data.distanceValue) : null,
      distanceUnit: op.data.distanceUnit ?? 'km',
      kind: op.data.kind ?? 'distance',
      startTimeLocal: op.data.startTimeLocal ? new Date(op.data.startTimeLocal) : null,
      timeLimitMinutes: op.data.timeLimitMinutes ?? null,
      terrain: op.data.terrain ?? null,
      isVirtual: op.data.isVirtual ?? false,
      capacity: op.data.capacity ?? null,
      capacityScope: op.data.capacityScope ?? 'per_distance',
      sortOrder: event.distances.length + index,
      priceCents: resolveProjectedPriceCents(op.data) ?? 0,
      currency: defaultCurrency,
      hasPricingTier: true,
      pricingTierCount: 1,
      hasBoundedPricingTier: false,
      registrationCount: 0,
    }));
}

export function projectAggregateFromProposal(
  event: EventEditionDetail,
  patch: EventAiWizardPatch,
  aggregateInput: ProposalProjectionAggregateInput,
) {
  const projectedFaqItems = [
    ...event.faqItems,
    ...patch.ops
      .filter(
        (op): op is Extract<EventAiWizardPatch['ops'][number], { type: 'create_faq_item' }> =>
          op.type === 'create_faq_item',
      )
      .map((op, index) => ({
        id: `projected-faq-${index}`,
        question: op.data.question,
        answer: op.data.answerMarkdown,
        sortOrder: event.faqItems.length + index,
      })),
  ];
  const addedWaiverCount = patch.ops.filter((op) => op.type === 'create_waiver').length;
  const addedQuestionCount = patch.ops.filter((op) => op.type === 'create_question').length;
  const addedAddOnCount = patch.ops.filter((op) => op.type === 'create_add_on').length;
  const addsWebsiteContent = patch.ops.some((op) => op.type === 'append_website_section_markdown');
  const addsPolicyContent =
    patch.ops.some(
      (op) => op.type === 'append_policy_markdown' || op.type === 'update_policy_config',
    ) || addedWaiverCount > 0;
  const editionUpdates = patch.ops.filter(
    (op): op is Extract<EventAiWizardPatch['ops'][number], { type: 'update_edition' }> =>
      op.type === 'update_edition' && op.editionId === event.id,
  );
  const mergedEditionData = editionUpdates.reduce<Record<string, unknown>>(
    (accumulator, op) => ({ ...accumulator, ...op.data }),
    {},
  ) as Extract<EventAiWizardPatch['ops'][number], { type: 'update_edition' }>['data'];
  const policyConfigOp = patch.ops.find(
    (op): op is Extract<EventAiWizardPatch['ops'][number], { type: 'update_policy_config' }> =>
      op.type === 'update_policy_config',
  );
  const waiverTemplate = event.waivers[0];
  const projectedWebsiteContent = projectWebsiteContent(aggregateInput.websiteContent, patch);

  const projectedEvent = {
    ...event,
    description: mergedEditionData.description ?? event.description,
    timezone: mergedEditionData.timezone ?? event.timezone,
    registrationOpensAt:
      mergedEditionData.registrationOpensAt !== undefined
        ? mergedEditionData.registrationOpensAt
          ? new Date(mergedEditionData.registrationOpensAt)
          : null
        : event.registrationOpensAt,
    registrationClosesAt:
      mergedEditionData.registrationClosesAt !== undefined
        ? mergedEditionData.registrationClosesAt
          ? new Date(mergedEditionData.registrationClosesAt)
          : null
        : event.registrationClosesAt,
    startsAt:
      mergedEditionData.startsAt !== undefined
        ? mergedEditionData.startsAt
          ? new Date(mergedEditionData.startsAt)
          : null
        : event.startsAt,
    endsAt:
      mergedEditionData.endsAt !== undefined
        ? mergedEditionData.endsAt
          ? new Date(mergedEditionData.endsAt)
          : null
        : event.endsAt,
    locationDisplay: mergedEditionData.locationDisplay ?? event.locationDisplay,
    city: mergedEditionData.city ?? event.city,
    state: mergedEditionData.state ?? event.state,
    address: mergedEditionData.address ?? event.address,
    latitude: mergedEditionData.latitude ?? event.latitude,
    longitude: mergedEditionData.longitude ?? event.longitude,
    faqItems: projectedFaqItems,
    waivers: [
      ...event.waivers,
      ...Array.from({ length: addedWaiverCount }, (_, index) => ({
        ...(waiverTemplate ?? ({} as (typeof event.waivers)[number])),
        id: `projected-waiver-${index}`,
      })),
    ],
    policyConfig: addsPolicyContent
      ? {
          ...(event.policyConfig ?? ({} as NonNullable<typeof event.policyConfig>)),
          ...(policyConfigOp?.data.refundsAllowed !== undefined
            ? { refundsAllowed: policyConfigOp.data.refundsAllowed }
            : {}),
          ...(policyConfigOp?.data.refundPolicyText !== undefined
            ? { refundPolicyText: policyConfigOp.data.refundPolicyText }
            : {}),
          ...(policyConfigOp?.data.refundDeadline !== undefined
            ? {
                refundDeadline: policyConfigOp.data.refundDeadline
                  ? new Date(policyConfigOp.data.refundDeadline)
                  : null,
              }
            : {}),
          ...(policyConfigOp?.data.transfersAllowed !== undefined
            ? { transfersAllowed: policyConfigOp.data.transfersAllowed }
            : {}),
          ...(policyConfigOp?.data.transferPolicyText !== undefined
            ? { transferPolicyText: policyConfigOp.data.transferPolicyText }
            : {}),
          ...(policyConfigOp?.data.transferDeadline !== undefined
            ? {
                transferDeadline: policyConfigOp.data.transferDeadline
                  ? new Date(policyConfigOp.data.transferDeadline)
                  : null,
              }
            : {}),
          ...(policyConfigOp?.data.deferralsAllowed !== undefined
            ? { deferralsAllowed: policyConfigOp.data.deferralsAllowed }
            : {}),
          ...(policyConfigOp?.data.deferralPolicyText !== undefined
            ? { deferralPolicyText: policyConfigOp.data.deferralPolicyText }
            : {}),
          ...(policyConfigOp?.data.deferralDeadline !== undefined
            ? {
                deferralDeadline: policyConfigOp.data.deferralDeadline
                  ? new Date(policyConfigOp.data.deferralDeadline)
                  : null,
              }
            : {}),
        }
      : event.policyConfig,
    distances: [
      ...projectExistingDistances(event, patch),
      ...projectCreatedDistances(event, patch),
    ],
  };

  return buildEventWizardAggregate(projectedEvent, {
    ...aggregateInput,
    hasWebsiteContent: aggregateInput.hasWebsiteContent || addsWebsiteContent,
    websiteContent: projectedWebsiteContent,
    questionCount: (aggregateInput.questionCount ?? 0) + addedQuestionCount,
    addOnCount: (aggregateInput.addOnCount ?? 0) + addedAddOnCount,
  });
}
