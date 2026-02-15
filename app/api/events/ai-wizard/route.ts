import { NextResponse } from 'next/server';
import { tool, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, streamText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

import { requireAuthenticatedUser } from '@/lib/auth/guards';
import { getEventEditionDetail } from '@/lib/events/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { ProFeatureAccessError, requireProFeature } from '@/lib/pro-features/server/guard';
import { buildEventAiWizardSystemPrompt } from '@/lib/events/ai-wizard/prompt';
import { eventAiWizardPatchSchema } from '@/lib/events/ai-wizard/schemas';
import type { EventAiWizardUIMessage } from '@/lib/events/ai-wizard/ui-types';

export const maxDuration = 30;

const requestSchema = z
  .object({
    editionId: z.string().uuid(),
    messages: z.array(z.unknown()),
  })
  .passthrough();

function proFeatureErrorToResponse(error: ProFeatureAccessError) {
  if (error.decision.status === 'disabled') {
    return NextResponse.json({ code: 'FEATURE_DISABLED' }, { status: 503 });
  }
  return NextResponse.json({ code: 'PRO_REQUIRED' }, { status: 403 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', details: parsed.error.issues }, { status: 400 });
  }

  const { editionId, messages } = parsed.data;

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

  const canAccess = await canUserAccessSeries(authContext.user.id, event.seriesId);
  if (!canAccess) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const modelName = process.env.EVENT_AI_WIZARD_MODEL || 'gpt-4o';

  const stream = createUIMessageStream<EventAiWizardUIMessage>({
    originalMessages: messages as EventAiWizardUIMessage[],
    execute: async ({ writer }) => {
      writer.write({
        type: 'data-notification',
        data: { message: 'Thinking...', level: 'info' },
        transient: true,
      });

      const system = buildEventAiWizardSystemPrompt(event);
      const modelMessages = await convertToModelMessages(messages as EventAiWizardUIMessage[]);

      const result = streamText({
        model: openai(modelName),
        system,
        messages: modelMessages,
        tools: {
          proposePatch: tool({
            description:
              'Propose a single patch of allowlisted operations for the current event edition. The user will review and apply it.',
            inputSchema: eventAiWizardPatchSchema,
            execute: async (patch) => {
              const patchId = crypto.randomUUID();
              writer.write({
                type: 'data-event-patch',
                id: patchId,
                data: patch,
              });
              return { patchId };
            },
          }),
        },
        stopWhen: stepCountIs(8),
      });

      writer.merge(result.toUIMessageStream({ originalMessages: messages as EventAiWizardUIMessage[] }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
