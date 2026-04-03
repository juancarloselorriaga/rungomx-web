import { normalizeEditionDateTimeForPersistence } from '@/lib/events/datetime';

import { createAddOnBundle } from './op-handlers/create-add-on-bundle';
import {
  createDistance,
  createFaqItem,
  createPricingTier,
  createQuestion,
  createWaiver,
  getWebsiteContent,
  updateDistancePrice,
  updateEventEdition,
  updateEventPolicyConfig,
  updateWebsiteContent,
} from './persistence';
import {
  appendMarkdown,
  normalizeDistanceStartTimeLocal,
  normalizeIsoDateTime,
  normalizeLocalDateTime,
  resolvePriceCents,
} from './preflight';
import type { ApplyTx } from './db-client';
import type {
  EventAiWizardApplyEngineInput,
  EventAiWizardApplyFailureCode,
  EventAiWizardOpExecutionResult,
  PolicyState,
} from './types';

function mapActionFailure(code?: string): {
  code: EventAiWizardApplyFailureCode;
  retryable: boolean;
} {
  switch (code) {
    case 'FORBIDDEN':
      return { code: 'READ_ONLY', retryable: false };
    case 'VALIDATION_ERROR':
    case 'DATE_OVERLAP':
    case 'INVALID_DISTANCE':
    case 'SLUG_TAKEN':
    case 'NOT_FOUND':
      return { code: 'INVALID_PATCH', retryable: false };
    default:
      return { code: 'RETRY_LATER', retryable: true };
  }
}

export async function executeApplyOp(params: {
  input: EventAiWizardApplyEngineInput;
  opIndex: number;
  policyState: PolicyState;
  tx: ApplyTx;
}): Promise<EventAiWizardOpExecutionResult> {
  const { input, opIndex } = params;
  const op = input.patch.ops[opIndex];
  const mutationContext = {
    tx: params.tx,
    editionId: input.editionId,
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    requestContext: input.requestContext,
  };

  if ('editionId' in op && op.editionId !== input.editionId) {
    return {
      ok: false,
      code: 'INVALID_PATCH',
      retryable: false,
      details: { opIndex, reason: 'EDITION_MISMATCH' },
    };
  }

  if (op.type === 'update_edition') {
    const effectiveTimezone = op.data.timezone ?? input.event.timezone;
    const startsAt =
      op.data.startsAt === undefined
        ? undefined
        : op.data.startsAt === null
          ? null
          : normalizeEditionDateTimeForPersistence(op.data.startsAt, effectiveTimezone);
    const endsAt =
      op.data.endsAt === undefined
        ? undefined
        : op.data.endsAt === null
          ? null
          : normalizeEditionDateTimeForPersistence(op.data.endsAt, effectiveTimezone);
    const registrationOpensAt =
      op.data.registrationOpensAt === undefined
        ? undefined
        : op.data.registrationOpensAt === null
          ? null
          : normalizeIsoDateTime(op.data.registrationOpensAt);
    const registrationClosesAt =
      op.data.registrationClosesAt === undefined
        ? undefined
        : op.data.registrationClosesAt === null
          ? null
          : normalizeIsoDateTime(op.data.registrationClosesAt);

    if (
      (op.data.startsAt && !startsAt) ||
      (op.data.endsAt && !endsAt) ||
      (op.data.registrationOpensAt && !registrationOpensAt) ||
      (op.data.registrationClosesAt && !registrationClosesAt)
    ) {
      return {
        ok: false,
        code: 'INVALID_PATCH',
        retryable: false,
        details: { opIndex, reason: 'INVALID_DATETIME' },
      };
    }

    const result = await updateEventEdition(mutationContext, {
      editionLabel: op.data.editionLabel,
      slug: op.data.slug,
      description: op.data.description,
      timezone: op.data.timezone,
      startsAt,
      endsAt,
      city: op.data.city,
      state: op.data.state,
      country: op.data.country,
      locationDisplay: op.data.locationDisplay,
      address: op.data.address,
      latitude: op.data.latitude,
      longitude: op.data.longitude,
      externalUrl: op.data.externalUrl,
      registrationOpensAt,
      registrationClosesAt,
    });

    if (!result.ok) {
      const failure = mapActionFailure(result.code);
      return {
        ok: false,
        code: failure.code,
        retryable: failure.retryable,
        details: { opIndex, operation: op.type },
      };
    }

    return {
      ok: true,
      appliedOp: { opIndex, type: op.type, status: 'applied' },
      policyState: params.policyState,
    };
  }

  if (op.type === 'create_distance') {
    const priceCents = resolvePriceCents(op.data);
    const startTimeLocal = normalizeDistanceStartTimeLocal(op.data.startTimeLocal);
    if (startTimeLocal === null) {
      return {
        ok: false,
        code: 'INVALID_PATCH',
        retryable: false,
        details: { opIndex, reason: 'INVALID_DATETIME' },
      };
    }

    const result = await createDistance(mutationContext, {
      label: op.data.label,
      distanceValue: op.data.distanceValue,
      distanceUnit: op.data.distanceUnit ?? 'km',
      kind: op.data.kind ?? 'distance',
      startTimeLocal: startTimeLocal ?? undefined,
      timeLimitMinutes: op.data.timeLimitMinutes ?? undefined,
      terrain: op.data.terrain ?? undefined,
      isVirtual: op.data.isVirtual ?? false,
      capacity: op.data.capacity ?? undefined,
      capacityScope: op.data.capacityScope ?? 'per_distance',
      priceCents,
    });

    if (!result.ok) {
      const failure = mapActionFailure(result.code);
      return {
        ok: false,
        code: failure.code,
        retryable: failure.retryable,
        details: { opIndex, operation: op.type },
      };
    }

    return {
      ok: true,
      appliedOp: { opIndex, type: op.type, status: 'applied', result: result.data },
      policyState: params.policyState,
    };
  }

  if (op.type === 'update_distance_price') {
    const result = await updateDistancePrice(mutationContext, {
      distanceId: op.distanceId,
      priceCents: resolvePriceCents(op.data),
    });

    if (!result.ok) {
      const failure = mapActionFailure(result.code);
      return {
        ok: false,
        code: failure.code,
        retryable: failure.retryable,
        details: { opIndex, operation: op.type },
      };
    }

    return {
      ok: true,
      appliedOp: { opIndex, type: op.type, status: 'applied' },
      policyState: params.policyState,
    };
  }

  if (op.type === 'create_pricing_tier') {
    const startsAt =
      op.data.startsAt === undefined || op.data.startsAt === null
        ? null
        : normalizeLocalDateTime(op.data.startsAt);
    const endsAt =
      op.data.endsAt === undefined || op.data.endsAt === null
        ? null
        : normalizeLocalDateTime(op.data.endsAt);

    if ((op.data.startsAt && !startsAt) || (op.data.endsAt && !endsAt)) {
      return {
        ok: false,
        code: 'INVALID_PATCH',
        retryable: false,
        details: { opIndex, reason: 'INVALID_DATETIME' },
      };
    }

    const result = await createPricingTier(mutationContext, {
      distanceId: op.distanceId,
      label: op.data.label ?? null,
      startsAt,
      endsAt,
      priceCents: resolvePriceCents(op.data),
      currency: op.data.currency ?? 'MXN',
    });

    if (!result.ok) {
      const failure = mapActionFailure(result.code);
      return {
        ok: false,
        code: failure.code,
        retryable: failure.retryable,
        details: { opIndex, operation: op.type },
      };
    }

    return {
      ok: true,
      appliedOp: { opIndex, type: op.type, status: 'applied', result: result.data },
      policyState: params.policyState,
    };
  }

  if (op.type === 'create_faq_item') {
    const result = await createFaqItem(mutationContext, {
      question: op.data.question,
      answer: op.data.answerMarkdown,
    });

    if (!result.ok) {
      const failure = mapActionFailure(result.code);
      return {
        ok: false,
        code: failure.code,
        retryable: failure.retryable,
        details: { opIndex, operation: op.type },
      };
    }

    return {
      ok: true,
      appliedOp: { opIndex, type: op.type, status: 'applied', result: result.data },
      policyState: params.policyState,
    };
  }

  if (op.type === 'create_waiver') {
    const result = await createWaiver(mutationContext, {
      title: op.data.title,
      body: op.data.bodyMarkdown,
      signatureType: op.data.signatureType ?? 'checkbox',
    });

    if (!result.ok) {
      const failure = mapActionFailure(result.code);
      return {
        ok: false,
        code: failure.code,
        retryable: failure.retryable,
        details: { opIndex, operation: op.type },
      };
    }

    return {
      ok: true,
      appliedOp: { opIndex, type: op.type, status: 'applied', result: result.data },
      policyState: params.policyState,
    };
  }

  if (op.type === 'create_question') {
    const result = await createQuestion(mutationContext, {
      distanceId: op.data.distanceId ?? null,
      type: op.data.type,
      prompt: op.data.prompt,
      helpText: op.data.helpTextMarkdown ?? null,
      isRequired: op.data.isRequired ?? false,
      options: op.data.options ?? null,
      sortOrder: op.data.sortOrder ?? 0,
      isActive: op.data.isActive ?? true,
    });

    if (!result.ok) {
      const failure = mapActionFailure(result.code);
      return {
        ok: false,
        code: failure.code,
        retryable: failure.retryable,
        details: { opIndex, operation: op.type },
      };
    }

    return {
      ok: true,
      appliedOp: { opIndex, type: op.type, status: 'applied', result: result.data },
      policyState: params.policyState,
    };
  }

  if (op.type === 'create_add_on') {
    const bundle = await createAddOnBundle({
      tx: params.tx,
      editionId: input.editionId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      requestContext: input.requestContext,
      data: {
        distanceId: op.data.distanceId,
        title: op.data.title,
        descriptionMarkdown: op.data.descriptionMarkdown,
        type: op.data.type,
        deliveryMethod: op.data.deliveryMethod,
        isActive: op.data.isActive,
        sortOrder: op.data.sortOrder,
        optionLabel: op.data.optionLabel,
        optionPriceCents: resolvePriceCents({
          priceCents: op.data.optionPriceCents,
          price: op.data.optionPrice,
        }),
        optionMaxQtyPerOrder: op.data.optionMaxQtyPerOrder,
      },
      aiWizardApplyMeta: {
        proposalId: input.proposalId,
        proposalFingerprint: input.proposalFingerprint,
        idempotencyKey: input.idempotencyKey,
        replayKey: input.replayKey,
        replayKeyKind: input.replayKeyKind,
        syntheticReplayKey: input.syntheticReplayKey,
        opIndex,
        opType: op.type,
      },
    });

    if (!bundle.ok) {
      return {
        ok: false,
        code: 'RETRY_LATER',
        retryable: true,
        details: { opIndex, operation: op.type },
      };
    }

    return {
      ok: true,
      appliedOp: {
        opIndex,
        type: op.type,
        status: 'applied',
        result: bundle.data,
      },
      policyState: params.policyState,
    };
  }

  if (op.type === 'append_website_section_markdown') {
    const locale = op.data.locale ?? input.locale ?? 'es';
    const contentResult = await getWebsiteContent(mutationContext, { locale });

    if (!contentResult.ok) {
      const failure = mapActionFailure(contentResult.code);
      return {
        ok: false,
        code: failure.code,
        retryable: failure.retryable,
        details: { opIndex, operation: op.type },
      };
    }

    const blocks = { ...contentResult.data.blocks };

    if (op.data.section === 'overview') {
      const previous = blocks.overview ?? {
        type: 'overview' as const,
        enabled: true,
        content: '',
      };
      blocks.overview = {
        ...previous,
        enabled: true,
        title: previous.title ?? op.data.title,
        content: op.data.markdown.trim(),
      };
    } else if (op.data.section === 'course') {
      const previous = blocks.course ?? { type: 'course' as const, enabled: true };
      blocks.course = {
        ...previous,
        enabled: true,
        title: previous.title ?? op.data.title,
        description: appendMarkdown(previous.description, op.data.markdown),
      };
    } else if (op.data.section === 'schedule') {
      const previous = blocks.schedule ?? { type: 'schedule' as const, enabled: true };
      blocks.schedule = {
        ...previous,
        enabled: true,
        title: previous.title ?? op.data.title,
        raceDay: appendMarkdown(previous.raceDay, op.data.markdown),
      };
    }

    const updateResult = await updateWebsiteContent(mutationContext, {
      locale,
      blocks,
    });

    if (!updateResult.ok) {
      const failure = mapActionFailure(updateResult.code);
      return {
        ok: false,
        code: failure.code,
        retryable: failure.retryable,
        details: { opIndex, operation: op.type },
      };
    }

    return {
      ok: true,
      appliedOp: {
        opIndex,
        type: op.type,
        status: 'applied',
        result: { locale, section: op.data.section, contentId: updateResult.data.id },
      },
      policyState: params.policyState,
    };
  }

  if (op.type === 'append_policy_markdown') {
    const nextPolicy = { ...params.policyState };

    if (op.data.policy === 'refund') {
      nextPolicy.refundsAllowed = op.data.enable ?? true;
      nextPolicy.refundPolicyText = appendMarkdown(nextPolicy.refundPolicyText, op.data.markdown);
    } else if (op.data.policy === 'transfer') {
      nextPolicy.transfersAllowed = op.data.enable ?? true;
      nextPolicy.transferPolicyText = appendMarkdown(
        nextPolicy.transferPolicyText,
        op.data.markdown,
      );
    } else if (op.data.policy === 'deferral') {
      nextPolicy.deferralsAllowed = op.data.enable ?? true;
      nextPolicy.deferralPolicyText = appendMarkdown(
        nextPolicy.deferralPolicyText,
        op.data.markdown,
      );
    }

    const result = await updateEventPolicyConfig(mutationContext, {
      refundsAllowed: nextPolicy.refundsAllowed,
      refundPolicyText: nextPolicy.refundPolicyText,
      refundDeadline: nextPolicy.refundDeadline,
      transfersAllowed: nextPolicy.transfersAllowed,
      transferPolicyText: nextPolicy.transferPolicyText,
      transferDeadline: nextPolicy.transferDeadline,
      deferralsAllowed: nextPolicy.deferralsAllowed,
      deferralPolicyText: nextPolicy.deferralPolicyText,
      deferralDeadline: nextPolicy.deferralDeadline,
    });

    if (!result.ok) {
      const failure = mapActionFailure(result.code);
      return {
        ok: false,
        code: failure.code,
        retryable: failure.retryable,
        details: { opIndex, operation: op.type },
      };
    }

    const policyState = {
      refundsAllowed: result.data.refundsAllowed,
      refundPolicyText: result.data.refundPolicyText,
      refundDeadline: result.data.refundDeadline,
      transfersAllowed: result.data.transfersAllowed,
      transferPolicyText: result.data.transferPolicyText,
      transferDeadline: result.data.transferDeadline,
      deferralsAllowed: result.data.deferralsAllowed,
      deferralPolicyText: result.data.deferralPolicyText,
      deferralDeadline: result.data.deferralDeadline,
    };

    return {
      ok: true,
      appliedOp: {
        opIndex,
        type: op.type,
        status: 'applied',
        result: { policy: op.data.policy },
      },
      policyState,
    };
  }

  if (op.type === 'update_policy_config') {
    const nextPolicy = {
      ...params.policyState,
      ...(op.data.refundsAllowed !== undefined ? { refundsAllowed: op.data.refundsAllowed } : {}),
      ...(op.data.refundPolicyText !== undefined
        ? { refundPolicyText: op.data.refundPolicyText }
        : {}),
      ...(op.data.refundDeadline !== undefined
        ? {
            refundDeadline: op.data.refundDeadline
              ? normalizeIsoDateTime(op.data.refundDeadline)
              : null,
          }
        : {}),
      ...(op.data.transfersAllowed !== undefined
        ? { transfersAllowed: op.data.transfersAllowed }
        : {}),
      ...(op.data.transferPolicyText !== undefined
        ? { transferPolicyText: op.data.transferPolicyText }
        : {}),
      ...(op.data.transferDeadline !== undefined
        ? {
            transferDeadline: op.data.transferDeadline
              ? normalizeIsoDateTime(op.data.transferDeadline)
              : null,
          }
        : {}),
      ...(op.data.deferralsAllowed !== undefined
        ? { deferralsAllowed: op.data.deferralsAllowed }
        : {}),
      ...(op.data.deferralPolicyText !== undefined
        ? { deferralPolicyText: op.data.deferralPolicyText }
        : {}),
      ...(op.data.deferralDeadline !== undefined
        ? {
            deferralDeadline: op.data.deferralDeadline
              ? normalizeIsoDateTime(op.data.deferralDeadline)
              : null,
          }
        : {}),
    };

    const result = await updateEventPolicyConfig(mutationContext, {
      refundsAllowed: nextPolicy.refundsAllowed,
      refundPolicyText: nextPolicy.refundPolicyText,
      refundDeadline: nextPolicy.refundDeadline,
      transfersAllowed: nextPolicy.transfersAllowed,
      transferPolicyText: nextPolicy.transferPolicyText,
      transferDeadline: nextPolicy.transferDeadline,
      deferralsAllowed: nextPolicy.deferralsAllowed,
      deferralPolicyText: nextPolicy.deferralPolicyText,
      deferralDeadline: nextPolicy.deferralDeadline,
    });

    if (!result.ok) {
      const failure = mapActionFailure(result.code);
      return {
        ok: false,
        code: failure.code,
        retryable: failure.retryable,
        details: { opIndex, operation: op.type },
      };
    }

    const policyState = {
      refundsAllowed: result.data.refundsAllowed,
      refundPolicyText: result.data.refundPolicyText,
      refundDeadline: result.data.refundDeadline,
      transfersAllowed: result.data.transfersAllowed,
      transferPolicyText: result.data.transferPolicyText,
      transferDeadline: result.data.transferDeadline,
      deferralsAllowed: result.data.deferralsAllowed,
      deferralPolicyText: result.data.deferralPolicyText,
      deferralDeadline: result.data.deferralDeadline,
    };

    return {
      ok: true,
      appliedOp: {
        opIndex,
        type: op.type,
        status: 'applied',
        result: {
          refundsAllowed: policyState.refundsAllowed,
          transfersAllowed: policyState.transfersAllowed,
          deferralsAllowed: policyState.deferralsAllowed,
        },
      },
      policyState,
    };
  }

  return {
    ok: false,
    code: 'INVALID_PATCH',
    retryable: false,
    details: { opIndex, reason: 'UNKNOWN_OP' },
  };
}
