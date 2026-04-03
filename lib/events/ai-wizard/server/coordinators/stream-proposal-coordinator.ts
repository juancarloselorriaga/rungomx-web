import {
  tool,
  convertToModelMessages,
  createUIMessageStream,
  streamText,
  stepCountIs,
  type UIMessageStreamWriter,
} from 'ai';
import { openai } from '@ai-sdk/openai';

import type { EventEditionDetail } from '@/lib/events/queries';
import { eventAiWizardPatchSchema, type EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';
import { trackProFeatureEvent } from '@/lib/pro-features/server/tracking';
import type {
  EventAiWizardEarlyProseLead,
  EventAiWizardFastPathKind,
  EventAiWizardUIMessage,
} from '@/lib/events/ai-wizard/ui-types';
import { finalizeProposalForUi } from '@/lib/events/ai-wizard/server/proposals/finalize/finalize-proposal';
import { normalizeMessageHistoryForModelConversion } from '../planning/normalize-message-history';
import { buildExecutionPlan } from '../planning/build-execution-plan';
import { buildFastPathStructure } from '../planning/detect-fast-path';
import { buildScopedAssistantContext } from '../context/build-scoped-assistant-context';
import { enrichPatchWithResolvedLocation } from '../context/enrich-patch-with-resolved-location';
import {
  buildStepDiagnosisText,
  normalizeWizardLocale,
} from '../proposals/deterministic/build-step-diagnosis';
import { buildDeterministicBasicsFollowUpPatch } from '../proposals/deterministic/build-basics-follow-up';
import { buildDeterministicPoliciesFollowUpPatch } from '../proposals/deterministic/build-policies-follow-up';
import {
  buildFastPathPatch,
  fastPathContentBundleProposalSchema,
  fastPathDescriptionProposalSchema,
  fastPathFaqProposalSchema,
  fastPathPolicyProposalSchema,
  fastPathWebsiteOverviewProposalSchema,
} from '../proposals/fast-path/build-fast-path-patch';
import type { EventAiWizardPlanningStepId } from '../planning/types';

function buildEarlyProseLead(
  stepId: string,
  locale: string | undefined,
  event: EventEditionDetail,
  fastPathKind: EventAiWizardFastPathKind | null,
): EventAiWizardEarlyProseLead | null {
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

  if (
    stepId === 'content' ||
    fastPathKind === 'faq' ||
    fastPathKind === 'website_overview' ||
    fastPathKind === 'content_bundle'
  ) {
    return {
      body: isEnglish
        ? `I’m starting from the confirmed details for ${eventName}${place ? ` in ${place}` : ''}${distanceSummary ? `, with ${distanceSummary}` : ''}. I’ll turn that into clear race-page copy first and leave any unconfirmed logistics out of the draft.`
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
        ? `I’m reviewing the confirmed setup for ${eventName} and will lead with the most useful improvement before publishing. I’ll point out what still needs confirmation instead of padding the recommendation with assumptions.`
        : `Estoy revisando la configuración confirmada de ${eventName} y voy a empezar por la mejora más útil de cara a publicación. Señalaré lo que todavía requiera confirmación en vez de rellenar la recomendación con supuestos.`,
    };
  }

  return null;
}

function emitPatch(
  writer: UIMessageStreamWriter<EventAiWizardUIMessage>,
  patch: EventAiWizardPatch,
) {
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

async function trackProposalFinalized(params: {
  actorUserId: string;
  editionId: string;
  stepId: EventAiWizardPlanningStepId;
  plan: ReturnType<typeof buildExecutionPlan>;
  proposal: EventAiWizardPatch;
}) {
  await trackProFeatureEvent({
    featureKey: 'event_ai_wizard',
    userId: params.actorUserId,
    eventType: 'used',
    meta: {
      endpoint: 'stream',
      phase: 'proposal_finalized',
      editionId: params.editionId,
      stepId: params.stepId,
      executionMode: params.plan.mode,
      fastPathKind: params.plan.fastPathKind,
      deterministicHandler: params.plan.deterministicHandler,
      opCount: params.proposal.ops.length,
      missingChecklistCount: params.proposal.missingFieldsChecklist?.length ?? 0,
      intentRouteCount: params.proposal.intentRouting?.length ?? 0,
      hasChoiceRequest: Boolean(params.proposal.choiceRequest),
      hasLocationResolution: Boolean(params.proposal.locationResolution),
      risky: Boolean(params.proposal.risky),
    },
  });
}

export async function streamProposalCoordinator(args: {
  actorUserId: string;
  editionId: string;
  stepId: EventAiWizardPlanningStepId;
  locale?: string;
  eventBrief?: string | null;
  messages: unknown[];
  event: EventEditionDetail;
}) {
  const plan = buildExecutionPlan({
    event: args.event,
    stepId: args.stepId,
    locale: args.locale,
    eventBrief: args.eventBrief,
    messages: args.messages,
  });

  const scopedContext = await buildScopedAssistantContext({
    editionId: args.editionId,
    event: args.event,
    stepId: args.stepId,
    plan,
  });

  const stream = createUIMessageStream<EventAiWizardUIMessage>({
    originalMessages: args.messages as EventAiWizardUIMessage[],
    execute: async ({ writer }) => {
      writer.write({
        type: 'data-notification',
        data: { code: 'analyzing_request', level: 'info' },
        transient: true,
      });

      const earlyProseLead = buildEarlyProseLead(
        args.stepId,
        args.locale,
        args.event,
        plan.fastPathKind,
      );
      if (earlyProseLead) {
        writer.write({
          type: 'data-early-prose',
          data: earlyProseLead,
          transient: true,
        });
      }

      if (plan.fastPathKind) {
        writer.write({
          type: 'data-fast-path-structure',
          data: buildFastPathStructure(plan.fastPathKind),
          transient: true,
        });
      }

      const deterministicDiagnosisText =
        plan.mode === 'diagnosis' &&
        (args.stepId === 'basics' ||
          args.stepId === 'pricing' ||
          args.stepId === 'policies' ||
          args.stepId === 'content' ||
          args.stepId === 'review')
          ? buildStepDiagnosisText({
              event: args.event,
              aggregate: scopedContext.aggregate,
              stepId: args.stepId,
              locale: normalizeWizardLocale(args.locale),
              diagnosisNextStep: scopedContext.diagnosisNextStep,
              hasWebsiteContent: scopedContext.hasWebsiteContent,
            })
          : null;
      const deterministicBasicsFollowUpPatch =
        plan.deterministicHandler === 'basics_follow_up'
          ? buildDeterministicBasicsFollowUpPatch({
              editionId: args.editionId,
              locale: args.locale,
              latestUserText: plan.latestUserText,
              resolvedLocation: scopedContext.locationResolution,
            })
          : null;
      const deterministicPoliciesFollowUpPatch =
        plan.deterministicHandler === 'policies_follow_up'
          ? buildDeterministicPoliciesFollowUpPatch({
              editionId: args.editionId,
              locale: args.locale,
              latestUserText: plan.latestUserText,
              event: args.event,
            })
          : null;

      writer.write({
        type: 'data-notification',
        data: { code: 'grounding_snapshot', level: 'info' },
        transient: true,
      });
      writer.write({
        type: 'data-notification',
        data: { code: 'drafting_response', level: 'info' },
        transient: true,
      });

      if (deterministicDiagnosisText) {
        writer.write({ type: 'text-start', id: `diagnosis-${args.stepId}` });
        writer.write({
          type: 'text-delta',
          id: `diagnosis-${args.stepId}`,
          delta: deterministicDiagnosisText,
        });
        writer.write({ type: 'text-end', id: `diagnosis-${args.stepId}` });
        return;
      }

      const modelMessages = await convertToModelMessages(
        normalizeMessageHistoryForModelConversion(args.messages),
      );

      if (deterministicBasicsFollowUpPatch || deterministicPoliciesFollowUpPatch) {
        const finalizedProposal = finalizeProposalForUi(
          args.event,
          deterministicBasicsFollowUpPatch ?? deterministicPoliciesFollowUpPatch!,
          scopedContext.aggregateInput,
          scopedContext.locationResolution,
          plan.crossStepIntent,
        );
        emitPatch(writer, finalizedProposal);
        void trackProposalFinalized({
          actorUserId: args.actorUserId,
          editionId: args.editionId,
          stepId: args.stepId,
          plan,
          proposal: finalizedProposal,
        });
        return;
      }

      const baseTools = {
        proposeDescriptionPatch: tool({
          description:
            'Create the first reviewable patch for the event description only. Use this for broad copy-heavy content requests.',
          inputSchema: fastPathDescriptionProposalSchema,
          execute: async (proposal) => {
            const enrichedPatch = await enrichPatchWithResolvedLocation(
              args.event,
              buildFastPathPatch('event_description', args.editionId, args.locale, proposal),
              { stepId: args.stepId, locale: args.locale },
            );
            const finalizedProposal = finalizeProposalForUi(
              args.event,
              enrichedPatch,
              scopedContext.aggregateInput,
              scopedContext.locationResolution,
              plan.crossStepIntent,
            );
            void trackProposalFinalized({
              actorUserId: args.actorUserId,
              editionId: args.editionId,
              stepId: args.stepId,
              plan,
              proposal: finalizedProposal,
            });
            return emitPatch(writer, finalizedProposal);
          },
        }),
        proposeFaqPatch: tool({
          description:
            'Create the first reviewable patch for FAQ content only. Keep it narrow and runner-facing.',
          inputSchema: fastPathFaqProposalSchema,
          execute: async (proposal) => {
            const finalizedProposal = finalizeProposalForUi(
              args.event,
              buildFastPathPatch('faq', args.editionId, args.locale, proposal),
              scopedContext.aggregateInput,
              scopedContext.locationResolution,
              plan.crossStepIntent,
            );
            void trackProposalFinalized({
              actorUserId: args.actorUserId,
              editionId: args.editionId,
              stepId: args.stepId,
              plan,
              proposal: finalizedProposal,
            });
            return emitPatch(writer, finalizedProposal);
          },
        }),
        proposeContentBundlePatch: tool({
          description:
            'Create one reviewable patch that combines FAQ content plus website overview when the organizer explicitly asked for both.',
          inputSchema: fastPathContentBundleProposalSchema,
          execute: async (proposal) => {
            const finalizedProposal = finalizeProposalForUi(
              args.event,
              buildFastPathPatch('content_bundle', args.editionId, args.locale, proposal),
              scopedContext.aggregateInput,
              scopedContext.locationResolution,
              plan.crossStepIntent,
            );
            void trackProposalFinalized({
              actorUserId: args.actorUserId,
              editionId: args.editionId,
              stepId: args.stepId,
              plan,
              proposal: finalizedProposal,
            });
            return emitPatch(writer, finalizedProposal);
          },
        }),
        proposeWebsiteOverviewPatch: tool({
          description: 'Create the first reviewable patch for the website overview section only.',
          inputSchema: fastPathWebsiteOverviewProposalSchema,
          execute: async (proposal) => {
            const finalizedProposal = finalizeProposalForUi(
              args.event,
              buildFastPathPatch('website_overview', args.editionId, args.locale, proposal),
              scopedContext.aggregateInput,
              scopedContext.locationResolution,
              plan.crossStepIntent,
            );
            void trackProposalFinalized({
              actorUserId: args.actorUserId,
              editionId: args.editionId,
              stepId: args.stepId,
              plan,
              proposal: finalizedProposal,
            });
            return emitPatch(writer, finalizedProposal);
          },
        }),
        proposePolicyPatch: tool({
          description: 'Create the first reviewable patch for one public policy block only.',
          inputSchema: fastPathPolicyProposalSchema,
          execute: async (proposal) => {
            const finalizedProposal = finalizeProposalForUi(
              args.event,
              buildFastPathPatch('policy', args.editionId, args.locale, proposal),
              scopedContext.aggregateInput,
              scopedContext.locationResolution,
              plan.crossStepIntent,
            );
            void trackProposalFinalized({
              actorUserId: args.actorUserId,
              editionId: args.editionId,
              stepId: args.stepId,
              plan,
              proposal: finalizedProposal,
            });
            return emitPatch(writer, finalizedProposal);
          },
        }),
        proposePatch: tool({
          description:
            'Propose a single patch of allowlisted operations for the current event edition. The user will review and apply it.',
          inputSchema: eventAiWizardPatchSchema,
          execute: async (patch) => {
            const enrichedPatch = await enrichPatchWithResolvedLocation(args.event, patch, {
              stepId: args.stepId,
              locale: args.locale,
            });
            const finalizedProposal = finalizeProposalForUi(
              args.event,
              enrichedPatch,
              scopedContext.aggregateInput,
              scopedContext.locationResolution,
              plan.crossStepIntent,
            );
            void trackProposalFinalized({
              actorUserId: args.actorUserId,
              editionId: args.editionId,
              stepId: args.stepId,
              plan,
              proposal: finalizedProposal,
            });
            return emitPatch(writer, finalizedProposal);
          },
        }),
      };

      const streamConfig = {
        model: openai(plan.modelPlan.model),
        providerOptions: plan.modelPlan.providerOptions,
        system: scopedContext.system,
        messages: modelMessages,
        stopWhen: stepCountIs(plan.modelPlan.stepBudget),
      } as const;

      const result =
        plan.fastPathKind === 'event_description'
          ? streamText({
              ...streamConfig,
              toolChoice: { type: 'tool', toolName: 'proposeDescriptionPatch' },
              tools: { proposeDescriptionPatch: baseTools.proposeDescriptionPatch },
            })
          : plan.fastPathKind === 'faq'
            ? streamText({
                ...streamConfig,
                toolChoice: { type: 'tool', toolName: 'proposeFaqPatch' },
                tools: { proposeFaqPatch: baseTools.proposeFaqPatch },
              })
            : plan.fastPathKind === 'content_bundle'
              ? streamText({
                  ...streamConfig,
                  toolChoice: { type: 'tool', toolName: 'proposeContentBundlePatch' },
                  tools: { proposeContentBundlePatch: baseTools.proposeContentBundlePatch },
                })
              : plan.fastPathKind === 'website_overview'
                ? streamText({
                    ...streamConfig,
                    toolChoice: { type: 'tool', toolName: 'proposeWebsiteOverviewPatch' },
                    tools: { proposeWebsiteOverviewPatch: baseTools.proposeWebsiteOverviewPatch },
                  })
                : plan.fastPathKind === 'policy'
                  ? streamText({
                      ...streamConfig,
                      toolChoice: { type: 'tool', toolName: 'proposePolicyPatch' },
                      tools: { proposePolicyPatch: baseTools.proposePolicyPatch },
                    })
                  : streamText({
                      ...streamConfig,
                      toolChoice:
                        plan.mode === 'deterministic_follow_up'
                          ? { type: 'tool', toolName: 'proposePatch' as const }
                          : undefined,
                      tools: { proposePatch: baseTools.proposePatch },
                    });

      writer.merge(
        result.toUIMessageStream({ originalMessages: args.messages as EventAiWizardUIMessage[] }),
      );
    },
  });

  return stream;
}
