import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import { requireAuthenticatedUser } from '@/lib/auth/guards';
import { getRequestContext } from '@/lib/audit';
import { eventAiWizardApplyRequestSchema } from '@/lib/events/ai-wizard/schemas';
import { evaluateAiWizardPatchSafety } from '@/lib/events/ai-wizard/safety';
import { applyAiWizardPatch } from '@/lib/events/ai-wizard/server/apply/apply-engine';
import {
  buildApplyCoreFromPatch,
  fingerprintApplyCore,
} from '@/lib/events/ai-wizard/server/apply/idempotency';
import { resolveLocationChoice } from '@/lib/events/ai-wizard/server/apply/resolve-location-choice';
import type { EventAiWizardApplyFailure } from '@/lib/events/ai-wizard/server/apply/types';
import { getEventEditionDetail } from '@/lib/events/queries';
import { canUserAccessSeries, hasOrgPermission } from '@/lib/organizations/permissions';
import { ProFeatureAccessError, requireProFeature } from '@/lib/pro-features/server/guard';
import { trackProFeatureEvent } from '@/lib/pro-features/server/tracking';
import { checkRateLimit } from '@/lib/rate-limit';

export const maxDuration = 30;

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

function toLegacyAppliedPayload(
  applied: Array<{ opIndex: number; type: string; result?: unknown }>,
) {
  return applied.map((entry) => ({
    opIndex: entry.opIndex,
    type: entry.type,
    ...(entry.result !== undefined ? { result: entry.result } : {}),
  }));
}

function toApplyFailureResponse(result: EventAiWizardApplyFailure) {
  if (result.code === 'INVALID_DISTANCE') {
    return NextResponse.json(
      { error: 'INVALID_DISTANCE', details: result.details },
      { status: 400 },
    );
  }

  if (result.code === 'READ_ONLY') {
    return NextResponse.json(
      {
        code: 'READ_ONLY',
        details: result.details,
        applied: toLegacyAppliedPayload(result.applied),
      },
      { status: 403 },
    );
  }

  if (result.code === 'INVALID_PATCH') {
    return NextResponse.json(
      {
        code: 'INVALID_PATCH',
        details: result.details,
        applied: toLegacyAppliedPayload(result.applied),
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      code: 'RETRY_LATER',
      details: result.details,
      applied: toLegacyAppliedPayload(result.applied),
    },
    { status: 503 },
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = eventAiWizardApplyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_BODY', details: parsed.error.issues },
      { status: 400 },
    );
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

  const { editionId, locale: requestLocale, patch, locationChoice } = parsed.data;

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

  const resolvedLocationChoice = resolveLocationChoice({ patch, locationChoice });
  if (!resolvedLocationChoice.ok) {
    return NextResponse.json(
      {
        code: 'INVALID_PATCH',
        details: resolvedLocationChoice.details,
        applied: [],
      },
      { status: 400 },
    );
  }

  const effectivePatch = resolvedLocationChoice.patch;

  const patchSafety = evaluateAiWizardPatchSafety(effectivePatch);
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

  const core = buildApplyCoreFromPatch(effectivePatch);
  const proposalFingerprint = fingerprintApplyCore(core);
  const requestContext = await getRequestContext(await headers());

  const result = await applyAiWizardPatch({
    editionId,
    locale: requestLocale,
    actorUserId: authContext.user.id,
    organizationId: membership.organizationId,
    event,
    patch: effectivePatch,
    core,
    proposalFingerprint,
    requestContext,
  });

  if (!result.ok) {
    await trackProFeatureEvent({
      featureKey: 'event_ai_wizard',
      userId: authContext.user.id,
      eventType: 'blocked',
      meta: {
        endpoint: 'apply',
        outcome: 'rejected',
        editionId,
        proposalFingerprint,
        code: result.code,
        retryable: result.retryable,
        failedOpIndex: result.failedOpIndex,
        appliedCount: result.applied.length,
        hadLocationChoice: Boolean(locationChoice),
        hadChoiceRequest: Boolean(patch.choiceRequest),
      },
    });
    return toApplyFailureResponse(result);
  }

  await trackProFeatureEvent({
    featureKey: 'event_ai_wizard',
    userId: authContext.user.id,
    eventType: 'used',
    meta: {
      endpoint: 'apply',
      outcome: 'applied',
      editionId,
      proposalFingerprint,
      opCount: effectivePatch.ops.length,
      appliedCount: result.applied.length,
      missingChecklistCount: effectivePatch.missingFieldsChecklist?.length ?? 0,
      intentRouteCount: effectivePatch.intentRouting?.length ?? 0,
      hadLocationChoice: Boolean(locationChoice),
      hadChoiceRequest: Boolean(patch.choiceRequest),
    },
  });

  return NextResponse.json({ ok: true, applied: toLegacyAppliedPayload(result.applied) });
}
