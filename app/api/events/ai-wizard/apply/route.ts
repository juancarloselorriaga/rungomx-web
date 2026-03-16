import { NextResponse } from 'next/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { addOnOptions, addOns, eventDistances, eventEditions, pricingTiers } from '@/db/schema';
import { requireAuthenticatedUser } from '@/lib/auth/guards';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import {
  createDistance,
  createFaqItem,
  createWaiver,
  updateDistancePrice,
  updateEventEdition,
  updateEventPolicyConfig,
} from '@/lib/events/actions';
import { normalizeEditionDateTimeForPersistence } from '@/lib/events/ai-wizard/datetime';
import { eventAiWizardApplyRequestSchema } from '@/lib/events/ai-wizard/schemas';
import { evaluateAiWizardPatchSafety } from '@/lib/events/ai-wizard/safety';
import { createPricingTier } from '@/lib/events/pricing/actions';
import { getEventEditionDetail } from '@/lib/events/queries';
import { createQuestion } from '@/lib/events/questions/actions';
import { getWebsiteContent, updateWebsiteContent } from '@/lib/events/website/actions';
import { canUserAccessSeries, hasOrgPermission } from '@/lib/organizations/permissions';
import { ProFeatureAccessError, requireProFeature } from '@/lib/pro-features/server/guard';
import { trackProFeatureEvent } from '@/lib/pro-features/server/tracking';
import { checkRateLimit } from '@/lib/rate-limit';
import { findConflictingPricingTier } from '@/lib/events/pricing/contracts';

export const maxDuration = 30;

type EventAiWizardApplyPatch = z.infer<typeof eventAiWizardApplyRequestSchema>['patch'];

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

function canUseAssistantWithMembership(role: Parameters<typeof hasOrgPermission>[0]) {
  return (
    hasOrgPermission(role, 'canEditEventConfig') &&
    hasOrgPermission(role, 'canEditRegistrationSettings')
  );
}

function mapApplyFailure(code?: string) {
  switch (code) {
    case 'FORBIDDEN':
      return { status: 403, code: 'READ_ONLY' as const };
    case 'VALIDATION_ERROR':
    case 'DATE_OVERLAP':
    case 'INVALID_DISTANCE':
    case 'SLUG_TAKEN':
    case 'NOT_FOUND':
      return { status: 400, code: 'INVALID_PATCH' as const };
    default:
      return { status: 503, code: 'RETRY_LATER' as const };
  }
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

async function preflightPatch(
  editionId: string,
  patch: EventAiWizardApplyPatch,
  event: NonNullable<Awaited<ReturnType<typeof getEventEditionDetail>>>,
) {
  const pricingDistanceIds: string[] = Array.from(
    new Set(
      patch.ops
        .filter(
          (
            op,
          ): op is Extract<EventAiWizardApplyPatch['ops'][number], { type: 'create_pricing_tier' }> =>
            op.type === 'create_pricing_tier',
        )
        .map((op) => op.distanceId),
    ),
  );

  const tiersByDistanceId = new Map<
    string,
    Array<{
      id: string;
      distanceId: string;
      label: string | null;
      startsAt: Date | null;
      endsAt: Date | null;
      priceCents: number;
      currency: string;
      sortOrder: number;
    }>
  >();

  if (pricingDistanceIds.length) {
    const existingTiers = await db.query.pricingTiers.findMany({
      where: and(inArray(pricingTiers.distanceId, pricingDistanceIds), isNull(pricingTiers.deletedAt)),
    });
    for (const tier of existingTiers) {
      const existing = tiersByDistanceId.get(tier.distanceId) ?? [];
      existing.push({
        id: tier.id,
        distanceId: tier.distanceId,
        label: tier.label,
        startsAt: tier.startsAt,
        endsAt: tier.endsAt,
        priceCents: tier.priceCents,
        currency: tier.currency,
        sortOrder: tier.sortOrder,
      });
      tiersByDistanceId.set(tier.distanceId, existing);
    }
  }

  for (let i = 0; i < patch.ops.length; i += 1) {
    const op = patch.ops[i];

    if ('editionId' in op && op.editionId !== editionId) {
      return { status: 400, code: 'INVALID_PATCH' as const, details: { opIndex: i, reason: 'EDITION_MISMATCH' } };
    }

    if (op.type === 'update_edition') {
      const effectiveTimezone = op.data.timezone ?? event.timezone;
      if (
        (op.data.startsAt &&
          !normalizeEditionDateTimeForPersistence(op.data.startsAt, effectiveTimezone)) ||
        (op.data.endsAt &&
          !normalizeEditionDateTimeForPersistence(op.data.endsAt, effectiveTimezone)) ||
        (op.data.registrationOpensAt && !normalizeIsoDateTime(op.data.registrationOpensAt)) ||
        (op.data.registrationClosesAt && !normalizeIsoDateTime(op.data.registrationClosesAt))
      ) {
        return { status: 400, code: 'INVALID_PATCH' as const, details: { opIndex: i, reason: 'INVALID_DATETIME' } };
      }

      if (op.data.slug && op.data.slug !== event.slug) {
        const existingEdition = await db.query.eventEditions.findFirst({
          where: and(
            eq(eventEditions.seriesId, event.seriesId),
            eq(eventEditions.slug, op.data.slug),
            isNull(eventEditions.deletedAt),
          ),
        });
        if (existingEdition) {
          return { status: 400, code: 'INVALID_PATCH' as const, details: { opIndex: i, reason: 'SLUG_TAKEN' } };
        }
      }
    }

    if (op.type === 'create_distance' && op.data.startTimeLocal && !normalizeIsoDateTime(op.data.startTimeLocal)) {
      return { status: 400, code: 'INVALID_PATCH' as const, details: { opIndex: i, reason: 'INVALID_DATETIME' } };
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
        return { status: 400, code: 'INVALID_PATCH' as const, details: { opIndex: i, reason: 'INVALID_DATETIME' } };
      }

      const existingTiers = tiersByDistanceId.get(op.distanceId) ?? [];
      const conflictingTier = findConflictingPricingTier({ startsAt: startsAt ? new Date(startsAt) : null, endsAt: endsAt ? new Date(endsAt) : null }, existingTiers);
      if (conflictingTier) {
        return { status: 400, code: 'INVALID_PATCH' as const, details: { opIndex: i, reason: 'DATE_OVERLAP' } };
      }

      tiersByDistanceId.set(op.distanceId, [
        ...existingTiers,
        {
          id: `preflight-${i}`,
          distanceId: op.distanceId,
          label: op.data.label ?? null,
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
          priceCents: resolvePriceCents(op.data),
          currency: op.data.currency ?? 'MXN',
          sortOrder: existingTiers.length,
        },
      ]);
    }
  }

  return null;
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

  const { editionId, locale: requestLocale, patch } = parsed.data;

  const event = await getEventEditionDetail(editionId);
  if (!event) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const membership = await canUserAccessSeries(authContext.user.id, event.seriesId);
  if (!membership) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!canUseAssistantWithMembership(membership.role)) {
    return NextResponse.json({ code: 'READ_ONLY' }, { status: 403 });
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

  const preflightFailure = await preflightPatch(editionId, patch, event);
  if (preflightFailure) {
    return NextResponse.json(
      {
        code: preflightFailure.code,
        details: preflightFailure.details,
        applied: [],
      },
      { status: preflightFailure.status },
    );
  }

  const applied: Array<{ opIndex: number; type: string; result?: unknown }> = [];
  let policyState = initializePolicyState(event);
  const requestContext = await getRequestContext(await headers());

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
      const effectiveTimezone = data.timezone ?? event.timezone;
      const startsAt =
        data.startsAt === undefined
          ? undefined
          : data.startsAt === null
            ? null
            : normalizeEditionDateTimeForPersistence(data.startsAt, effectiveTimezone);
      const endsAt =
        data.endsAt === undefined
          ? undefined
          : data.endsAt === null
            ? null
            : normalizeEditionDateTimeForPersistence(data.endsAt, effectiveTimezone);
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
        const failure = mapApplyFailure(result.code);
        return opError(failure.status, {
          code: failure.code,
          details: { opIndex: i, operation: op.type },
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
        const failure = mapApplyFailure(result.code);
        return opError(failure.status, {
          code: failure.code,
          details: { opIndex: i, operation: op.type },
        });
      }

      applied.push({ opIndex: i, type: op.type, result: result.data });
      continue;
    }

    if (op.type === 'update_distance_price') {
      const priceCents = resolvePriceCents(op.data);
      const result = await updateDistancePrice({ distanceId: op.distanceId, priceCents });

      if (!result.ok) {
        const failure = mapApplyFailure(result.code);
        return opError(failure.status, {
          code: failure.code,
          details: { opIndex: i, operation: op.type },
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
        const failure = mapApplyFailure(result.code);
        return opError(failure.status, {
          code: failure.code,
          details: { opIndex: i, operation: op.type },
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
        const failure = mapApplyFailure(result.code);
        return opError(failure.status, {
          code: failure.code,
          details: { opIndex: i, operation: op.type },
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
        const failure = mapApplyFailure(result.code);
        return opError(failure.status, {
          code: failure.code,
          details: { opIndex: i, operation: op.type },
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
        const failure = mapApplyFailure(result.code);
        return opError(failure.status, {
          code: failure.code,
          details: { opIndex: i, operation: op.type },
        });
      }

      applied.push({ opIndex: i, type: op.type, result: result.data });
      continue;
    }

    if (op.type === 'create_add_on') {
      const addOnPayload = {
        editionId,
        distanceId: op.data.distanceId ?? null,
        title: op.data.title,
        description: op.data.descriptionMarkdown ?? null,
        type: op.data.type ?? 'merch',
        deliveryMethod: op.data.deliveryMethod ?? 'pickup',
        isActive: op.data.isActive ?? true,
        sortOrder: op.data.sortOrder ?? 0,
      };
      const optionPayload = {
        label: op.data.optionLabel ?? 'Standard',
        priceCents: resolvePriceCents({
          priceCents: op.data.optionPriceCents,
          price: op.data.optionPrice,
        }),
        maxQtyPerOrder: op.data.optionMaxQtyPerOrder ?? 5,
        isActive: true,
        sortOrder: 0,
      };

      const createdAddOnBundle = await db.transaction(async (tx) => {
        const [newAddOn] = await tx.insert(addOns).values(addOnPayload).returning();
        const addOnAudit = await createAuditLog(
          {
            organizationId: membership.organizationId,
            actorUserId: authContext.user.id,
            action: 'add_on.create',
            entityType: 'add_on',
            entityId: newAddOn.id,
            after: {
              title: addOnPayload.title,
              type: addOnPayload.type,
              deliveryMethod: addOnPayload.deliveryMethod,
              distanceId: addOnPayload.distanceId,
            },
            request: requestContext,
          },
          tx,
        );
        if (!addOnAudit.ok) {
          throw new Error('ADD_ON_AUDIT_FAILED');
        }

        const [newOption] = await tx
          .insert(addOnOptions)
          .values({
            addOnId: newAddOn.id,
            ...optionPayload,
            optionMeta: null,
          })
          .returning();
        const optionAudit = await createAuditLog(
          {
            organizationId: membership.organizationId,
            actorUserId: authContext.user.id,
            action: 'add_on_option.create',
            entityType: 'add_on_option',
            entityId: newOption.id,
            after: { label: optionPayload.label, priceCents: optionPayload.priceCents, addOnId: newAddOn.id },
            request: requestContext,
          },
          tx,
        );
        if (!optionAudit.ok) {
          throw new Error('ADD_ON_OPTION_AUDIT_FAILED');
        }

        return [newAddOn, newOption] as const;
      }).catch(() => null);

      if (!createdAddOnBundle) {
        return opError(503, {
          code: 'RETRY_LATER',
          details: { opIndex: i, operation: op.type },
        });
      }
      const [createdAddOn, createdOption] = createdAddOnBundle;

      applied.push({
        opIndex: i,
        type: op.type,
        result: {
          addOn: createdAddOn,
          option: createdOption,
        },
      });
      continue;
    }

    if (op.type === 'append_website_section_markdown') {
      const locale = op.data.locale ?? requestLocale ?? 'es';
      const contentResult = await getWebsiteContent({ editionId, locale });
      if (!contentResult.ok) {
        const failure = mapApplyFailure(contentResult.code);
        return opError(failure.status, {
          code: failure.code,
          details: { opIndex: i, operation: op.type },
        });
      }

      const blocks = { ...contentResult.data.blocks };

      if (op.data.section === 'overview') {
        const previous = blocks.overview ?? { type: 'overview' as const, enabled: true, content: '' };
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

      const updateResult = await updateWebsiteContent({
        editionId,
        locale,
        blocks,
      });

      if (!updateResult.ok) {
        const failure = mapApplyFailure(updateResult.code);
        return opError(failure.status, {
          code: failure.code,
          details: { opIndex: i, operation: op.type },
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
        const failure = mapApplyFailure(result.code);
        return opError(failure.status, {
          code: failure.code,
          details: { opIndex: i, operation: op.type },
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

    if (op.type === 'update_policy_config') {
      const nextPolicy = {
        ...policyState,
        ...(op.data.refundsAllowed !== undefined ? { refundsAllowed: op.data.refundsAllowed } : {}),
        ...(op.data.refundPolicyText !== undefined ? { refundPolicyText: op.data.refundPolicyText } : {}),
        ...(op.data.refundDeadline !== undefined
          ? {
              refundDeadline: op.data.refundDeadline
                ? normalizeIsoDateTime(op.data.refundDeadline)
                : null,
            }
          : {}),
        ...(op.data.transfersAllowed !== undefined ? { transfersAllowed: op.data.transfersAllowed } : {}),
        ...(op.data.transferPolicyText !== undefined ? { transferPolicyText: op.data.transferPolicyText } : {}),
        ...(op.data.transferDeadline !== undefined
          ? {
              transferDeadline: op.data.transferDeadline
                ? normalizeIsoDateTime(op.data.transferDeadline)
                : null,
            }
          : {}),
        ...(op.data.deferralsAllowed !== undefined ? { deferralsAllowed: op.data.deferralsAllowed } : {}),
        ...(op.data.deferralPolicyText !== undefined ? { deferralPolicyText: op.data.deferralPolicyText } : {}),
        ...(op.data.deferralDeadline !== undefined
          ? {
              deferralDeadline: op.data.deferralDeadline
                ? normalizeIsoDateTime(op.data.deferralDeadline)
                : null,
            }
          : {}),
      };

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
        const failure = mapApplyFailure(result.code);
        return opError(failure.status, {
          code: failure.code,
          details: { opIndex: i, operation: op.type },
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
        result: {
          refundsAllowed: policyState.refundsAllowed,
          transfersAllowed: policyState.transfersAllowed,
          deferralsAllowed: policyState.deferralsAllowed,
        },
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
