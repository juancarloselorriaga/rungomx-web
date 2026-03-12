import { NextResponse } from 'next/server';
import {
  tool,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  stepCountIs,
  type UIMessageStreamWriter,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

import { requireAuthenticatedUser } from '@/lib/auth/guards';
import { checkRateLimit } from '@/lib/rate-limit';
import { getEventEditionDetail } from '@/lib/events/queries';
import { getAddOnsForEdition } from '@/lib/events/add-ons/queries';
import { getQuestionsForEdition } from '@/lib/events/questions/queries';
import { canUserAccessSeries, hasOrgPermission } from '@/lib/organizations/permissions';
import { ProFeatureAccessError, requireProFeature } from '@/lib/pro-features/server/guard';
import { trackProFeatureEvent } from '@/lib/pro-features/server/tracking';
import { buildEventAiWizardSystemPrompt } from '@/lib/events/ai-wizard/prompt';
import { eventAiWizardPatchSchema, type EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';
import { evaluateAiWizardTextSafety, extractLatestUserText } from '@/lib/events/ai-wizard/safety';
import type {
  EventAiWizardEarlyProseLead,
  EventAiWizardFastPathKind,
  EventAiWizardFastPathStructure,
  EventAiWizardUIMessage,
} from '@/lib/events/ai-wizard/ui-types';
import { buildEventWizardAggregate } from '@/lib/events/wizard/orchestrator';
import { getPublicWebsiteContent, hasWebsiteContent } from '@/lib/events/website/queries';

export const maxDuration = 30;

const fastPathDescriptionProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    descriptionMarkdown: z.string().min(1).max(5000),
  })
  .strict();

const fastPathFaqProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    items: z
      .array(
        z
          .object({
            question: z.string().min(1).max(500),
            answerMarkdown: z.string().min(1).max(5000),
          })
          .strict(),
      )
      .min(2)
      .max(4),
  })
  .strict();

const fastPathWebsiteOverviewProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    markdown: z.string().min(1).max(10000),
    sectionTitle: z.string().max(255).optional(),
  })
  .strict();

const fastPathPolicyProposalSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    policy: z.enum(['refund', 'transfer', 'deferral']),
    markdown: z.string().min(1).max(5000),
  })
  .strict();

const requestSchema = z
  .object({
    editionId: z.string().uuid(),
    stepId: z.enum(['basics', 'distances', 'pricing', 'registration', 'policies', 'content', 'extras', 'review']),
    locale: z.string().min(2).max(10).optional(),
    eventBrief: z.string().max(4000).nullable().optional(),
    messages: z.array(z.unknown()),
  })
  .passthrough();

function mapIssueStepId(
  stepId: ReturnType<typeof buildEventWizardAggregate>['prioritizedChecklist'][number]['stepId'],
) {
  switch (stepId) {
    case 'event_details':
      return 'basics' as const;
    case 'distances':
      return 'distances' as const;
    case 'pricing':
      return 'pricing' as const;
    case 'waivers':
    case 'policies':
      return 'policies' as const;
    case 'faq':
    case 'website':
      return 'content' as const;
    case 'questions':
    case 'add_ons':
      return 'extras' as const;
    case 'publish':
      return 'review' as const;
    default:
      return 'basics' as const;
  }
}

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

function normalizeFastPathText(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function detectFastPathKind(
  stepId: z.infer<typeof requestSchema>['stepId'],
  latestUserText: string,
): EventAiWizardFastPathKind | null {
  const normalized = normalizeFastPathText(latestUserText);
  const hasSubstantialRequest = normalized.replace(/\s+/g, ' ').trim().length >= 12;

  const asksForFaq =
    /\bfaq\b/.test(normalized) ||
    normalized.includes('preguntas frecuentes') ||
    /\bpreguntas\b/.test(normalized) ||
    normalized.includes('common questions');
  const asksForPolicy =
    normalized.includes('politica') ||
    normalized.includes('politicas') ||
    normalized.includes('policy') ||
    normalized.includes('policies') ||
    normalized.includes('waiver') ||
    normalized.includes('reglamento') ||
    normalized.includes('terminos');
  const asksForWebsite =
    normalized.includes('website') ||
    normalized.includes('sitio') ||
    normalized.includes('landing') ||
    normalized.includes('pagina') ||
    normalized.includes('overview');
  const asksForDescription =
    normalized.includes('descripcion') ||
    normalized.includes('description') ||
    normalized.includes('summary') ||
    normalized.includes('resumen') ||
    normalized.includes('copy');

  if (stepId === 'policies' && asksForPolicy) return 'policy';
  if ((stepId === 'content' || stepId === 'review') && asksForFaq) return 'faq';
  if ((stepId === 'content' || stepId === 'review') && asksForWebsite) return 'website_overview';
  if (
    (stepId === 'basics' || stepId === 'content' || stepId === 'review') &&
    asksForDescription
  ) {
    return 'event_description';
  }

  if (hasSubstantialRequest) {
    if (stepId === 'policies') return 'policy';
    if (stepId === 'content' || stepId === 'review') return 'event_description';
  }

  return null;
}

function buildFastPathStructure(
  kind: EventAiWizardFastPathKind,
): EventAiWizardFastPathStructure {
  switch (kind) {
    case 'faq':
      return {
        kind,
        sectionKeys: ['event_basics', 'route_and_distances', 'registration_and_logistics'],
      };
    case 'website_overview':
      return {
        kind,
        sectionKeys: ['hero_positioning', 'confirmed_experience', 'what_to_confirm'],
      };
    case 'policy':
      return {
        kind,
        sectionKeys: ['core_rule', 'participant_responsibility', 'open_logistics'],
      };
    case 'event_description':
    default:
      return {
        kind: 'event_description',
        sectionKeys: ['lead', 'confirmed_highlights', 'pending_logistics'],
      };
  }
}

function buildEarlyProseLead(
  stepId: z.infer<typeof requestSchema>['stepId'],
  locale: string | undefined,
  event: Awaited<ReturnType<typeof getEventEditionDetail>>,
  fastPathKind: EventAiWizardFastPathKind | null,
): EventAiWizardEarlyProseLead | null {
  if (!event) return null;

  const normalizedLocale = (locale ?? 'es').toLowerCase();
  const isEnglish = normalizedLocale.startsWith('en');
  const eventName = [event.seriesName, event.editionLabel].filter(Boolean).join(' ');
  const place =
    event.locationDisplay?.trim() || [event.city, event.state].filter(Boolean).join(', ').trim();
  const distanceList = event.distances.map((distance) => distance.label).filter(Boolean);
  const distanceSummary =
    distanceList.length === 0
      ? null
      : distanceList.length === 1
        ? distanceList[0]
        : `${distanceList.slice(0, -1).join(', ')}${isEnglish ? ', and ' : ' y '}${distanceList.at(-1)}`;

  if (stepId === 'content' || fastPathKind === 'faq' || fastPathKind === 'website_overview') {
    return {
      body: isEnglish
        ? `I’m starting from the confirmed details for ${eventName}${place ? ` in ${place}` : ''}${distanceSummary ? `, with ${distanceSummary}` : ''}. I’ll turn that into participant-facing copy first and leave any unconfirmed logistics out of the draft.`
        : `Voy a arrancar con los detalles confirmados de ${eventName}${place ? ` en ${place}` : ''}${distanceSummary ? `, con ${distanceSummary}` : ''}. Primero los convertiré en texto para participantes y dejaré fuera cualquier logística que siga sin confirmarse.`,
    };
  }

  if (stepId === 'policies' || fastPathKind === 'policy') {
    return {
      body: isEnglish
        ? `I’m drafting a clear first policy pass for ${eventName} using only the rules you already confirmed${place ? ` for ${place}` : ''}. Anything operational or legally sensitive will stay cautious instead of being guessed.`
        : `Voy a redactar una primera versión clara de políticas para ${eventName} usando solo las reglas que ya confirmaste${place ? ` para ${place}` : ''}. Todo lo operativo o delicado en lo legal se quedará prudente en vez de adivinarse.`,
    };
  }

  if (stepId === 'review') {
    return {
      body: isEnglish
        ? `I’m reviewing the confirmed setup for ${eventName} and will lead with the most useful publish-facing improvement first. I’ll point out what still needs confirmation instead of padding the recommendation with assumptions.`
        : `Estoy revisando la configuración confirmada de ${eventName} y voy a empezar por la mejora más útil de cara a publicación. Señalaré lo que todavía requiera confirmación en vez de rellenar la recomendación con supuestos.`,
    };
  }

  return null;
}

function emitPatch(writer: UIMessageStreamWriter<EventAiWizardUIMessage>, patch: EventAiWizardPatch) {
  const patchId = crypto.randomUUID();
  writer.write({
    type: 'data-notification',
    data: { code: 'finalizing_proposal', level: 'info' },
    transient: true,
  });
  writer.write({
    type: 'data-event-patch',
    id: patchId,
    data: patch,
  });
  return { patchId };
}

type WizardAggregateInput = Parameters<typeof buildEventWizardAggregate>[1];

function buildProjectedAggregate(
  event: NonNullable<Awaited<ReturnType<typeof getEventEditionDetail>>>,
  patch: EventAiWizardPatch,
  aggregateInput: WizardAggregateInput,
) {
  const addedFaqCount = patch.ops.filter((op) => op.type === 'create_faq_item').length;
  const addedWaiverCount = patch.ops.filter((op) => op.type === 'create_waiver').length;
  const addedQuestionCount = patch.ops.filter((op) => op.type === 'create_question').length;
  const addedAddOnCount = patch.ops.filter((op) => op.type === 'create_add_on').length;
  const addsWebsiteContent = patch.ops.some((op) => op.type === 'append_website_section_markdown');
  const addsPolicyContent =
    patch.ops.some((op) => op.type === 'append_policy_markdown') || addedWaiverCount > 0;
  const descriptionOp = patch.ops.find(
    (op): op is Extract<EventAiWizardPatch['ops'][number], { type: 'update_edition' }> =>
      op.type === 'update_edition' && Boolean(op.data.description?.trim()),
  );
  const addedDistanceCount = patch.ops.filter((op) => op.type === 'create_distance').length;
  const pricingOpsCount = patch.ops.filter(
    (op) => op.type === 'create_pricing_tier' || op.type === 'update_distance_price',
  ).length;
  const faqTemplate = event.faqItems[0];
  const waiverTemplate = event.waivers[0];
  const distanceTemplate = event.distances[0];

  const projectedEvent = {
    ...event,
    description: descriptionOp?.data.description ?? event.description,
    faqItems: [
      ...event.faqItems,
      ...Array.from({ length: addedFaqCount }, (_, index) => ({
        ...(faqTemplate ?? ({} as (typeof event.faqItems)[number])),
        id: `projected-faq-${index}`,
      })),
    ],
    waivers: [
      ...event.waivers,
      ...Array.from({ length: addedWaiverCount }, (_, index) => ({
        ...(waiverTemplate ?? ({} as (typeof event.waivers)[number])),
        id: `projected-waiver-${index}`,
      })),
    ],
    policyConfig: addsPolicyContent
      ? event.policyConfig ?? ({} as NonNullable<typeof event.policyConfig>)
      : event.policyConfig,
    distances: [
      ...event.distances.map((distance) => ({
        ...distance,
        hasPricingTier: pricingOpsCount > 0 ? true : distance.hasPricingTier,
      })),
      ...Array.from({ length: addedDistanceCount }, (_, index) => ({
        ...(distanceTemplate ?? ({} as (typeof event.distances)[number])),
        id: `projected-distance-${index}`,
        label: `Projected distance ${index + 1}`,
        distanceValue: distanceTemplate?.distanceValue ?? null,
        distanceUnit: distanceTemplate?.distanceUnit ?? 'km',
        hasPricingTier: true,
      })),
    ],
  };

  return buildEventWizardAggregate(projectedEvent, {
    ...aggregateInput,
    hasWebsiteContent: aggregateInput.hasWebsiteContent || addsWebsiteContent,
    questionCount: (aggregateInput.questionCount ?? 0) + addedQuestionCount,
    addOnCount: (aggregateInput.addOnCount ?? 0) + addedAddOnCount,
  });
}

function canonicalIntentForStep(stepId: ReturnType<typeof mapIssueStepId>) {
  return `continue_${stepId}`;
}

export function finalizeWizardPatchForUi(
  event: NonNullable<Awaited<ReturnType<typeof getEventEditionDetail>>>,
  patch: EventAiWizardPatch,
  aggregateInput: WizardAggregateInput,
): EventAiWizardPatch {
  const projectedAggregate = buildProjectedAggregate(event, patch, aggregateInput);
  const projectedChecklist = [...projectedAggregate.publishBlockers, ...projectedAggregate.missingRequired].map((issue) => ({
    code: issue.code,
    stepId: mapIssueStepId(issue.stepId),
    label: issue.labelKey,
    severity: issue.severity,
  }));

  const canonicalIntentRouting = projectedAggregate.optionalRecommendations
    .map((issue) => mapIssueStepId(issue.stepId))
    .filter((stepId, index, list) => list.indexOf(stepId) === index)
    .slice(0, 3)
    .map((stepId) => ({
      intent: canonicalIntentForStep(stepId),
      stepId,
    }));

  return {
    ...patch,
    missingFieldsChecklist: projectedChecklist,
    intentRouting: canonicalIntentRouting,
  };
}

function buildFastPathPatch(
  kind: EventAiWizardFastPathKind,
  editionId: string,
  locale: string | undefined,
  proposal:
    | z.infer<typeof fastPathDescriptionProposalSchema>
    | z.infer<typeof fastPathFaqProposalSchema>
    | z.infer<typeof fastPathWebsiteOverviewProposalSchema>
    | z.infer<typeof fastPathPolicyProposalSchema>,
): EventAiWizardPatch {
  switch (kind) {
    case 'faq': {
      const faqProposal = proposal as z.infer<typeof fastPathFaqProposalSchema>;
      return {
        title: faqProposal.title,
        summary: faqProposal.summary,
        ops: faqProposal.items.map((item) => ({
          type: 'create_faq_item' as const,
          editionId,
          data: {
            question: item.question,
            answerMarkdown: item.answerMarkdown,
          },
        })),
        markdownOutputs: faqProposal.items.map((item) => ({
          domain: 'faq' as const,
          contentMarkdown: item.answerMarkdown,
        })),
      };
    }
    case 'website_overview': {
      const websiteProposal = proposal as z.infer<typeof fastPathWebsiteOverviewProposalSchema>;
      return {
        title: websiteProposal.title,
        summary: websiteProposal.summary,
        ops: [
          {
            type: 'append_website_section_markdown' as const,
            editionId,
            data: {
              section: 'overview' as const,
              markdown: websiteProposal.markdown,
              title: websiteProposal.sectionTitle,
              locale: locale ?? 'es',
            },
          },
        ],
        markdownOutputs: [
          {
            domain: 'website' as const,
            contentMarkdown: websiteProposal.markdown,
          },
        ],
      };
    }
    case 'policy': {
      const policyProposal = proposal as z.infer<typeof fastPathPolicyProposalSchema>;
      return {
        title: policyProposal.title,
        summary: policyProposal.summary,
        ops: [
          {
            type: 'append_policy_markdown' as const,
            editionId,
            data: {
              policy: policyProposal.policy,
              markdown: policyProposal.markdown,
              enable: true,
            },
          },
        ],
        markdownOutputs: [
          {
            domain: 'policy' as const,
            contentMarkdown: policyProposal.markdown,
          },
        ],
      };
    }
    case 'event_description':
    default: {
      const descriptionProposal = proposal as z.infer<typeof fastPathDescriptionProposalSchema>;
      return {
        title: descriptionProposal.title,
        summary: descriptionProposal.summary,
        ops: [
          {
            type: 'update_edition' as const,
            editionId,
            data: {
              description: descriptionProposal.descriptionMarkdown,
            },
          },
        ],
        markdownOutputs: [
          {
            domain: 'description' as const,
            contentMarkdown: descriptionProposal.descriptionMarkdown,
          },
        ],
      };
    }
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', details: parsed.error.issues }, { status: 400 });
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
  const fastPathKind = detectFastPathKind(stepId, latestUserText);
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

  const [websiteContent, websiteEnabled, questions, addOns] = await Promise.all([
    getPublicWebsiteContent(editionId, locale ?? 'es'),
    hasWebsiteContent(editionId),
    getQuestionsForEdition(editionId),
    getAddOnsForEdition(editionId),
  ]);

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

  const isCopyHeavyStep = stepId === 'policies' || stepId === 'content' || stepId === 'review';
  const aggregateInput = {
    selectedPath: null,
    hasWebsiteContent: websiteEnabled,
    questionCount: questions.length,
    addOnCount: addOns.length,
  } satisfies WizardAggregateInput;
  const fastModelName =
    process.env.EVENT_AI_WIZARD_FAST_MODEL ||
    'gpt-5-nano';
  const copyModelName =
    process.env.EVENT_AI_WIZARD_COPY_MODEL ||
    process.env.EVENT_AI_WIZARD_MODEL ||
    'gpt-5-mini';
  const modelName =
    (fastPathKind ? fastModelName : undefined) ||
    (isCopyHeavyStep ? copyModelName : undefined) ||
    process.env.EVENT_AI_WIZARD_MODEL ||
    copyModelName;
  const stepBudget = fastPathKind ? 4 : isCopyHeavyStep ? 6 : 8;
  const fastPathProviderOptions =
    fastPathKind && isCopyHeavyStep
      ? {
          openai: {
            reasoningEffort: 'minimal' as const,
            textVerbosity: 'low' as const,
          },
        }
      : undefined;

  const stream = createUIMessageStream<EventAiWizardUIMessage>({
    originalMessages: messages as EventAiWizardUIMessage[],
    execute: async ({ writer }) => {
      writer.write({
        type: 'data-notification',
        data: { code: 'analyzing_request', level: 'info' },
        transient: true,
      });

      const earlyProseLead = buildEarlyProseLead(stepId, locale, event, fastPathKind);
      if (earlyProseLead) {
        writer.write({
          type: 'data-early-prose',
          data: earlyProseLead,
          transient: true,
        });
      }

      if (fastPathKind) {
        writer.write({
          type: 'data-fast-path-structure',
          data: buildFastPathStructure(fastPathKind),
          transient: true,
        });
      }

      const aggregate = buildEventWizardAggregate(event, aggregateInput);
      const system = buildEventAiWizardSystemPrompt(event, {
        checklist: aggregate.prioritizedChecklist.map((issue) => ({
          ...issue,
          stepId: mapIssueStepId(issue.stepId),
        })),
        activeStepId: stepId,
        locale: locale ?? 'es',
        websiteContent,
        eventBrief: resolvedEventBrief,
        fastPathKind,
        compactMode: Boolean(fastPathKind && isCopyHeavyStep),
      });
      writer.write({
        type: 'data-notification',
        data: { code: 'grounding_snapshot', level: 'info' },
        transient: true,
      });
      const modelMessages = await convertToModelMessages(messages as EventAiWizardUIMessage[]);
      writer.write({
        type: 'data-notification',
        data: { code: 'drafting_response', level: 'info' },
        transient: true,
      });

      const baseTools = {
        proposeDescriptionPatch: tool({
          description:
            'Create the first reviewable patch for the event description only. Use this for broad copy-heavy content requests.',
          inputSchema: fastPathDescriptionProposalSchema,
          execute: async (proposal) =>
            emitPatch(
              writer,
              finalizeWizardPatchForUi(
                event,
                buildFastPathPatch('event_description', editionId, locale, proposal),
                aggregateInput,
              ),
            ),
        }),
        proposeFaqPatch: tool({
          description:
            'Create the first reviewable patch for FAQ content only. Keep it narrow and participant-facing.',
          inputSchema: fastPathFaqProposalSchema,
          execute: async (proposal) =>
            emitPatch(
              writer,
              finalizeWizardPatchForUi(event, buildFastPathPatch('faq', editionId, locale, proposal), aggregateInput),
            ),
        }),
        proposeWebsiteOverviewPatch: tool({
          description:
            'Create the first reviewable patch for the website overview section only.',
          inputSchema: fastPathWebsiteOverviewProposalSchema,
          execute: async (proposal) =>
            emitPatch(
              writer,
              finalizeWizardPatchForUi(
                event,
                buildFastPathPatch('website_overview', editionId, locale, proposal),
                aggregateInput,
              ),
            ),
        }),
        proposePolicyPatch: tool({
          description:
            'Create the first reviewable patch for one participant-facing policy block only.',
          inputSchema: fastPathPolicyProposalSchema,
          execute: async (proposal) =>
            emitPatch(
              writer,
              finalizeWizardPatchForUi(event, buildFastPathPatch('policy', editionId, locale, proposal), aggregateInput),
            ),
        }),
        proposePatch: tool({
          description:
            'Propose a single patch of allowlisted operations for the current event edition. The user will review and apply it.',
          inputSchema: eventAiWizardPatchSchema,
          execute: async (patch) => emitPatch(writer, finalizeWizardPatchForUi(event, patch, aggregateInput)),
        }),
      };
      const streamConfig = {
        model: openai(modelName),
        providerOptions: fastPathProviderOptions,
        system,
        messages: modelMessages,
        stopWhen: stepCountIs(stepBudget),
      } as const;

      const result =
        fastPathKind === 'event_description'
          ? streamText({
              ...streamConfig,
              toolChoice: { type: 'tool', toolName: 'proposeDescriptionPatch' },
              tools: {
                proposeDescriptionPatch: baseTools.proposeDescriptionPatch,
              },
            })
          : fastPathKind === 'faq'
            ? streamText({
                ...streamConfig,
                toolChoice: { type: 'tool', toolName: 'proposeFaqPatch' },
                tools: {
                  proposeFaqPatch: baseTools.proposeFaqPatch,
                },
              })
            : fastPathKind === 'website_overview'
              ? streamText({
                  ...streamConfig,
                  toolChoice: { type: 'tool', toolName: 'proposeWebsiteOverviewPatch' },
                  tools: {
                    proposeWebsiteOverviewPatch: baseTools.proposeWebsiteOverviewPatch,
                  },
                })
              : fastPathKind === 'policy'
                ? streamText({
                    ...streamConfig,
                    toolChoice: { type: 'tool', toolName: 'proposePolicyPatch' },
                    tools: {
                      proposePolicyPatch: baseTools.proposePolicyPatch,
                    },
                  })
                : streamText({
                    ...streamConfig,
                    tools: {
                      proposePatch: baseTools.proposePatch,
                    },
                  });

      writer.merge(result.toUIMessageStream({ originalMessages: messages as EventAiWizardUIMessage[] }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
