import { NextResponse } from 'next/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { eventDistances } from '@/db/schema';
import { requireAuthenticatedUser } from '@/lib/auth/guards';
import {
  createDistance,
  createFaqItem,
  createWaiver,
  updateDistancePrice,
  updateEventEdition,
  updateEventPolicyConfig,
} from '@/lib/events/actions';
import { eventAiWizardApplyRequestSchema } from '@/lib/events/ai-wizard/schemas';
import { evaluateAiWizardPatchSafety } from '@/lib/events/ai-wizard/safety';
import { createAddOn, createAddOnOption } from '@/lib/events/add-ons/actions';
import { createPricingTier } from '@/lib/events/pricing/actions';
import { getEventEditionDetail } from '@/lib/events/queries';
import { createQuestion } from '@/lib/events/questions/actions';
import { getWebsiteContent, updateWebsiteContent } from '@/lib/events/website/actions';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { ProFeatureAccessError, requireProFeature } from '@/lib/pro-features/server/guard';
import { trackProFeatureEvent } from '@/lib/pro-features/server/tracking';
import { checkRateLimit } from '@/lib/rate-limit';

export const maxDuration = 30;

type PolicyState = {
  refundsAllowed: boolean;
  refundPolicyText: string | null;
  refundDeadline: string | null;
  transfersAllowed: boolean;
  transferPolicyText: string | null;
  transferDeadline: string | null;
  deferralsAllowed: boolean;
  deferralPolicyText: string | null;
  deferralDeadline: string | null;
};

function proFeatureErrorToResponse(error: ProFeatureAccessError) {
  if (error.decision.status === 'disabled') {
    return NextResponse.json({ code: 'FEATURE_DISABLED' }, { status: 503 });
  }
  return NextResponse.json({ code: 'PRO_REQUIRED' }, { status: 403 });
}

function resolvePriceCents(data: { priceCents?: number; price?: number }): number {
  if (data.priceCents !== undefined) return data.priceCents;
  const price = data.price ?? 0;
  return Math.round(price * 100);
}

function normalizeIsoDateTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function normalizeLocalDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;

  // Fall back to UTC parts rendered as a timezone-less local datetime string.
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T${pad2(
    date.getUTCHours(),
  )}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

function appendMarkdown(existing: string | null | undefined, incoming: string): string {
  const previous = (existing ?? '').trim();
  const next = incoming.trim();

  if (!previous) return next;
  if (!next) return previous;
  if (previous.includes(next)) return previous;
  return `${previous}\n\n${next}`;
}

function initializePolicyState(event: Awaited<ReturnType<typeof getEventEditionDetail>>): PolicyState {
  return {
    refundsAllowed: event?.policyConfig?.refundsAllowed ?? false,
    refundPolicyText: event?.policyConfig?.refundPolicyText ?? null,
    refundDeadline: event?.policyConfig?.refundDeadline?.toISOString() ?? null,
    transfersAllowed: event?.policyConfig?.transfersAllowed ?? false,
    transferPolicyText: event?.policyConfig?.transferPolicyText ?? null,
    transferDeadline: event?.policyConfig?.transferDeadline?.toISOString() ?? null,
    deferralsAllowed: event?.policyConfig?.deferralsAllowed ?? false,
    deferralPolicyText: event?.policyConfig?.deferralPolicyText ?? null,
    deferralDeadline: event?.policyConfig?.deferralDeadline?.toISOString() ?? null,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = eventAiWizardApplyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', details: parsed.error.issues }, { status: 400 });
  }

  let authContext;
  try {
    authContext = await requireAuthenticatedUser();
  } catch {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  try {
    await requireProFeature('event_ai_wizard', authContext);
  } catch (error) {
    if (error instanceof ProFeatureAccessError) {
      return proFeatureErrorToResponse(error);
    }
    throw error;
  }

  const { editionId, patch } = parsed.data;

  const event = await getEventEditionDetail(editionId);
  if (!event) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const canAccess = await canUserAccessSeries(authContext.user.id, event.seriesId);
  if (!canAccess) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const applyRateLimit = await checkRateLimit(`${authContext.user.id}:${editionId}`, 'user', {
    action: 'event_ai_wizard_apply',
    maxRequests: 20,
    windowMs: 5 * 60 * 1000,
  });
  if (!applyRateLimit.allowed) {
    await trackProFeatureEvent({
      featureKey: 'event_ai_wizard',
      userId: authContext.user.id,
      eventType: 'blocked',
      meta: {
        blockCategory: 'rate_limit',
        endpoint: 'apply',
        editionId,
        resetAt: applyRateLimit.resetAt.toISOString(),
      },
    });
    return NextResponse.json(
      {
        code: 'RATE_LIMITED',
        category: 'rate_limit',
        endpoint: 'apply',
        resetAt: applyRateLimit.resetAt.toISOString(),
      },
      { status: 429 },
    );
  }

  const patchSafety = evaluateAiWizardPatchSafety(patch);
  if (patchSafety.blocked) {
    await trackProFeatureEvent({
      featureKey: 'event_ai_wizard',
      userId: authContext.user.id,
      eventType: 'blocked',
      meta: {
        blockCategory: patchSafety.category,
        blockReason: patchSafety.reason,
        endpoint: 'apply',
        editionId,
      },
    });
    return NextResponse.json(
      {
        code: 'SAFETY_BLOCKED',
        category: patchSafety.category,
        reason: patchSafety.reason,
        endpoint: 'apply',
      },
      { status: 400 },
    );
  }

  const referencedDistanceIds = Array.from(
    new Set(
      patch.ops
        .flatMap((op) => {
          if (op.type === 'update_distance_price' || op.type === 'create_pricing_tier') {
            return [op.distanceId];
          }
          if (op.type === 'create_question' || op.type === 'create_add_on') {
            return op.data.distanceId ? [op.data.distanceId] : [];
          }
          return [];
        })
        .filter((id): id is string => typeof id === 'string'),
    ),
  );

  if (referencedDistanceIds.length) {
    const rows = await db
      .select({ id: eventDistances.id })
      .from(eventDistances)
      .where(
        and(
          eq(eventDistances.editionId, editionId),
          isNull(eventDistances.deletedAt),
          inArray(eventDistances.id, referencedDistanceIds),
        ),
      );

    const allowed = new Set(rows.map((row) => row.id));
    const invalid = referencedDistanceIds.find((id) => !allowed.has(id));
    if (invalid) {
      return NextResponse.json(
        { error: 'INVALID_DISTANCE', details: { distanceId: invalid } },
        { status: 400 },
      );
    }
  }

  const applied: Array<{ opIndex: number; type: string; result?: unknown }> = [];
  let policyState = initializePolicyState(event);

  function opError(status: number, payload: Record<string, unknown>) {
    return NextResponse.json({ ...payload, applied }, { status });
  }

  for (let i = 0; i < patch.ops.length; i += 1) {
    const op = patch.ops[i];

    if ('editionId' in op && op.editionId !== editionId) {
      return opError(400, { error: 'INVALID_OP', details: { opIndex: i, reason: 'EDITION_MISMATCH' } });
    }

    if (op.type === 'update_edition') {
      const data = op.data;
      const startsAt =
        data.startsAt === undefined
          ? undefined
          : data.startsAt === null
            ? null
            : normalizeIsoDateTime(data.startsAt);
      const endsAt =
        data.endsAt === undefined
          ? undefined
          : data.endsAt === null
            ? null
            : normalizeIsoDateTime(data.endsAt);
      const registrationOpensAt =
        data.registrationOpensAt === undefined
          ? undefined
          : data.registrationOpensAt === null
            ? null
            : normalizeIsoDateTime(data.registrationOpensAt);
      const registrationClosesAt =
        data.registrationClosesAt === undefined
          ? undefined
          : data.registrationClosesAt === null
            ? null
            : normalizeIsoDateTime(data.registrationClosesAt);

      if (
        (data.startsAt && !startsAt) ||
        (data.endsAt && !endsAt) ||
        (data.registrationOpensAt && !registrationOpensAt) ||
        (data.registrationClosesAt && !registrationClosesAt)
      ) {
        return opError(400, { error: 'INVALID_DATETIME', details: { opIndex: i } });
      }

      const result = await updateEventEdition({
        editionId,
        editionLabel: data.editionLabel,
        slug: data.slug,
        description: data.description,
        timezone: data.timezone,
        startsAt,
        endsAt,
        city: data.city,
        state: data.state,
        locationDisplay: data.locationDisplay,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        externalUrl: data.externalUrl,
        registrationOpensAt,
        registrationClosesAt,
      });

      if (!result.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: result.code, message: result.error },
        });
      }

      applied.push({ opIndex: i, type: op.type });
      continue;
    }

    if (op.type === 'create_distance') {
      const priceCents = resolvePriceCents(op.data);
      const startTimeLocal =
        op.data.startTimeLocal === undefined
          ? undefined
          : op.data.startTimeLocal === null
            ? null
            : normalizeIsoDateTime(op.data.startTimeLocal);
      if (op.data.startTimeLocal && !startTimeLocal) {
        return opError(400, { error: 'INVALID_DATETIME', details: { opIndex: i } });
      }

      const result = await createDistance({
        editionId,
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
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: result.code, message: result.error },
        });
      }

      applied.push({ opIndex: i, type: op.type, result: result.data });
      continue;
    }

    if (op.type === 'update_distance_price') {
      const priceCents = resolvePriceCents(op.data);
      const result = await updateDistancePrice({ distanceId: op.distanceId, priceCents });

      if (!result.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: result.code, message: result.error },
        });
      }

      applied.push({ opIndex: i, type: op.type });
      continue;
    }

    if (op.type === 'create_pricing_tier') {
      const priceCents = resolvePriceCents(op.data);
      const startsAt =
        op.data.startsAt === undefined || op.data.startsAt === null
          ? null
          : normalizeLocalDateTime(op.data.startsAt);
      const endsAt =
        op.data.endsAt === undefined || op.data.endsAt === null
          ? null
          : normalizeLocalDateTime(op.data.endsAt);

      if ((op.data.startsAt && !startsAt) || (op.data.endsAt && !endsAt)) {
        return opError(400, { error: 'INVALID_DATETIME', details: { opIndex: i } });
      }

      const result = await createPricingTier({
        distanceId: op.distanceId,
        label: op.data.label ?? null,
        startsAt,
        endsAt,
        priceCents,
        currency: op.data.currency ?? 'MXN',
      });

      if (!result.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: result.code, message: result.error },
        });
      }

      applied.push({ opIndex: i, type: op.type, result: result.data });
      continue;
    }

    if (op.type === 'create_faq_item') {
      const result = await createFaqItem({
        editionId,
        question: op.data.question,
        answer: op.data.answerMarkdown,
      });

      if (!result.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: result.code, message: result.error },
        });
      }

      applied.push({ opIndex: i, type: op.type, result: result.data });
      continue;
    }

    if (op.type === 'create_waiver') {
      const result = await createWaiver({
        editionId,
        title: op.data.title,
        body: op.data.bodyMarkdown,
        signatureType: op.data.signatureType ?? 'checkbox',
      });

      if (!result.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: result.code, message: result.error },
        });
      }

      applied.push({ opIndex: i, type: op.type, result: result.data });
      continue;
    }

    if (op.type === 'create_question') {
      const result = await createQuestion({
        editionId,
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
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: result.code, message: result.error },
        });
      }

      applied.push({ opIndex: i, type: op.type, result: result.data });
      continue;
    }

    if (op.type === 'create_add_on') {
      const createAddOnResult = await createAddOn({
        editionId,
        distanceId: op.data.distanceId ?? null,
        title: op.data.title,
        description: op.data.descriptionMarkdown ?? null,
        type: op.data.type ?? 'merch',
        deliveryMethod: op.data.deliveryMethod ?? 'pickup',
        isActive: op.data.isActive ?? true,
        sortOrder: op.data.sortOrder ?? 0,
      });

      if (!createAddOnResult.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: createAddOnResult.code, message: createAddOnResult.error },
        });
      }

      const createOptionResult = await createAddOnOption({
        addOnId: createAddOnResult.data.id,
        label: op.data.optionLabel ?? 'Standard',
        priceCents: resolvePriceCents({
          priceCents: op.data.optionPriceCents,
          price: op.data.optionPrice,
        }),
        maxQtyPerOrder: op.data.optionMaxQtyPerOrder ?? 5,
        isActive: true,
        sortOrder: 0,
      });

      if (!createOptionResult.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: {
            opIndex: i,
            code: createOptionResult.code,
            message: createOptionResult.error,
            addOnId: createAddOnResult.data.id,
          },
        });
      }

      applied.push({
        opIndex: i,
        type: op.type,
        result: {
          addOn: createAddOnResult.data,
          option: createOptionResult.data,
        },
      });
      continue;
    }

    if (op.type === 'append_website_section_markdown') {
      const locale = op.data.locale ?? 'es';
      const contentResult = await getWebsiteContent({ editionId, locale });
      if (!contentResult.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: contentResult.code, message: contentResult.error },
        });
      }

      const blocks = { ...contentResult.data.blocks };

      if (op.data.section === 'overview') {
        const previous = blocks.overview ?? { type: 'overview' as const, enabled: true, content: '' };
        blocks.overview = {
          ...previous,
          enabled: true,
          title: previous.title ?? op.data.title,
          content: appendMarkdown(previous.content, op.data.markdown),
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

      const updateResult = await updateWebsiteContent({
        editionId,
        locale,
        blocks,
      });

      if (!updateResult.ok) {
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: updateResult.code, message: updateResult.error },
        });
      }

      applied.push({
        opIndex: i,
        type: op.type,
        result: { locale, section: op.data.section, contentId: updateResult.data.id },
      });
      continue;
    }

    if (op.type === 'append_policy_markdown') {
      const nextPolicy = { ...policyState };

      if (op.data.policy === 'refund') {
        nextPolicy.refundsAllowed = op.data.enable ?? true;
        nextPolicy.refundPolicyText = appendMarkdown(nextPolicy.refundPolicyText, op.data.markdown);
      } else if (op.data.policy === 'transfer') {
        nextPolicy.transfersAllowed = op.data.enable ?? true;
        nextPolicy.transferPolicyText = appendMarkdown(nextPolicy.transferPolicyText, op.data.markdown);
      } else if (op.data.policy === 'deferral') {
        nextPolicy.deferralsAllowed = op.data.enable ?? true;
        nextPolicy.deferralPolicyText = appendMarkdown(nextPolicy.deferralPolicyText, op.data.markdown);
      }

      const result = await updateEventPolicyConfig({
        editionId,
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
        return opError(400, {
          error: 'OP_FAILED',
          details: { opIndex: i, code: result.code, message: result.error },
        });
      }

      policyState = {
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

      applied.push({
        opIndex: i,
        type: op.type,
        result: { policy: op.data.policy },
      });
      continue;
    }

    return opError(400, { error: 'UNKNOWN_OP', details: { opIndex: i } });
  }

  await trackProFeatureEvent({
    featureKey: 'event_ai_wizard',
    userId: authContext.user.id,
    eventType: 'used',
    meta: {
      editionId,
      opCount: patch.ops.length,
      missingChecklistCount: patch.missingFieldsChecklist?.length ?? 0,
      intentRouteCount: patch.intentRouting?.length ?? 0,
    },
  });

  return NextResponse.json({ ok: true, applied });
}
