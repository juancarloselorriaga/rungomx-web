import { NextResponse } from 'next/server';
import { createUIMessageStreamResponse } from 'ai';
import { z } from 'zod';

import { requireAuthenticatedUser } from '@/lib/auth/guards';
import { getEventEditionDetail } from '@/lib/events/queries';
import { evaluateAiWizardTextSafety, extractLatestUserText } from '@/lib/events/ai-wizard/safety';
import { canUserAccessSeries, hasOrgPermission } from '@/lib/organizations/permissions';
import { ProFeatureAccessError, requireProFeature } from '@/lib/pro-features/server/guard';
import { trackProFeatureEvent } from '@/lib/pro-features/server/tracking';
import { checkRateLimit } from '@/lib/rate-limit';
import { EVENT_SETUP_WIZARD_STEP_IDS } from '@/lib/events/wizard/steps';
import { streamProposalCoordinator } from '@/lib/events/ai-wizard/server/coordinators/stream-proposal-coordinator';

export const maxDuration = 30;

const requestSchema = z
  .object({
    editionId: z.string().uuid(),
    stepId: z.enum(EVENT_SETUP_WIZARD_STEP_IDS),
    locale: z.string().min(2).max(10).optional(),
    eventBrief: z.string().max(4000).nullable().optional(),
    messages: z.array(z.unknown()),
  })
  .passthrough();

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

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_BODY', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { editionId, stepId, locale, eventBrief, messages } = parsed.data;

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

  const latestUserText = extractLatestUserText(messages);
  const safetyDecision = evaluateAiWizardTextSafety(latestUserText);
  if (safetyDecision.blocked) {
    await trackProFeatureEvent({
      featureKey: 'event_ai_wizard',
      userId: authContext.user.id,
      eventType: 'blocked',
      meta: {
        blockCategory: safetyDecision.category,
        blockReason: safetyDecision.reason,
        endpoint: 'stream',
        editionId,
      },
    });
    return NextResponse.json(
      {
        code: 'SAFETY_BLOCKED',
        category: safetyDecision.category,
        reason: safetyDecision.reason,
        endpoint: 'stream',
      },
      { status: 400 },
    );
  }

  const resolvedEventBrief = event.organizerBrief?.trim() || eventBrief?.trim() || null;
  const briefSafetyDecision = evaluateAiWizardTextSafety(resolvedEventBrief ?? '');
  if (briefSafetyDecision.blocked) {
    await trackProFeatureEvent({
      featureKey: 'event_ai_wizard',
      userId: authContext.user.id,
      eventType: 'blocked',
      meta: {
        blockCategory: briefSafetyDecision.category,
        blockReason: briefSafetyDecision.reason,
        endpoint: 'stream',
        editionId,
        blockInput: 'event_brief',
      },
    });
    return NextResponse.json(
      {
        code: 'SAFETY_BLOCKED',
        category: briefSafetyDecision.category,
        reason: briefSafetyDecision.reason,
        endpoint: 'stream',
      },
      { status: 400 },
    );
  }

  const streamRateLimit = await checkRateLimit(`${authContext.user.id}:${editionId}`, 'user', {
    action: 'event_ai_wizard_stream',
    maxRequests: 30,
    windowMs: 5 * 60 * 1000,
  });

  if (!streamRateLimit.allowed) {
    await trackProFeatureEvent({
      featureKey: 'event_ai_wizard',
      userId: authContext.user.id,
      eventType: 'blocked',
      meta: {
        blockCategory: 'rate_limit',
        endpoint: 'stream',
        editionId,
        resetAt: streamRateLimit.resetAt.toISOString(),
      },
    });
    return NextResponse.json(
      {
        code: 'RATE_LIMITED',
        category: 'rate_limit',
        endpoint: 'stream',
        resetAt: streamRateLimit.resetAt.toISOString(),
      },
      { status: 429 },
    );
  }

  const stream = await streamProposalCoordinator({
    actorUserId: authContext.user.id,
    editionId,
    stepId,
    locale,
    eventBrief,
    messages,
    event,
  });

  return createUIMessageStreamResponse({ stream });
}
