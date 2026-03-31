import { extractLatestUserText } from '@/lib/events/ai-wizard/safety';
import type { EventEditionDetail } from '@/lib/events/queries';
import { extractLocationIntentQuery } from '@/lib/events/ai-wizard/location-resolution';
import { resolvePreviousAssistantFastPathKind } from './normalize-message-history';
import {
  countRequestedPolicyKinds,
  hasExplicitDeferralConstraint,
  resolvePreferredFastPathKind,
  shouldForceBasicsFollowUpProposal,
} from './detect-fast-path';
import { resolveCrossStepIntent } from './resolve-cross-step-intent';
import type {
  EventAiWizardExecutionPlan,
  EventAiWizardForcedToolName,
  EventAiWizardPlanningStepId,
} from './types';

function normalizeFastPathText(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function isStepGapDiagnosisRequest(stepId: EventAiWizardPlanningStepId, latestUserText: string) {
  if (
    stepId !== 'basics' &&
    stepId !== 'pricing' &&
    stepId !== 'policies' &&
    stepId !== 'content' &&
    stepId !== 'review'
  ) {
    return false;
  }

  const normalized = normalizeFastPathText(latestUserText);
  if (!normalized.trim()) return false;

  const asksAboutMissing =
    normalized.includes('que falta') ||
    normalized.includes('que faltan') ||
    normalized.includes('faltan') ||
    normalized.includes('falta') ||
    normalized.includes('missing') ||
    normalized.includes('pendiente') ||
    normalized.includes('pendientes') ||
    normalized.includes('pending') ||
    normalized.includes('bloquea') ||
    normalized.includes('bloquean') ||
    normalized.includes('bloqueando') ||
    normalized.includes('bloqueo') ||
    normalized.includes('bloqueos') ||
    normalized.includes('blocker') ||
    normalized.includes('blockers') ||
    normalized.includes('blocking') ||
    normalized.includes('blocked');
  const asksAboutCurrentStep =
    stepId === 'basics'
      ? normalized.includes('aspectos basicos') ||
        normalized.includes('basics') ||
        normalized.includes('basico') ||
        normalized.includes('basicos')
      : stepId === 'pricing'
        ? normalized.includes('precios') ||
          normalized.includes('pricing') ||
          normalized.includes('tarifas') ||
          normalized.includes('precio')
        : stepId === 'policies'
          ? normalized.includes('politicas') ||
            normalized.includes('policies') ||
            normalized.includes('exenciones') ||
            normalized.includes('waivers')
          : stepId === 'content'
            ? normalized.includes('contenido') ||
              normalized.includes('content') ||
              normalized.includes('faq') ||
              normalized.includes('preguntas frecuentes') ||
              normalized.includes('website') ||
              normalized.includes('sitio')
            : normalized.includes('revision') ||
              normalized.includes('review') ||
              normalized.includes('publicacion') ||
              normalized.includes('publicar') ||
              normalized.includes('publish');

  return asksAboutMissing && asksAboutCurrentStep;
}

export function buildExecutionPlan(args: {
  event: EventEditionDetail;
  stepId: EventAiWizardPlanningStepId;
  locale?: string;
  eventBrief?: string | null;
  messages: unknown[];
}): EventAiWizardExecutionPlan {
  const latestUserText = extractLatestUserText(args.messages);
  const locale = args.locale ?? 'es';
  const resolvedEventBrief = args.event.organizerBrief?.trim() || args.eventBrief?.trim() || null;
  const diagnosisMode = isStepGapDiagnosisRequest(args.stepId, latestUserText);
  const crossStepIntent = diagnosisMode
    ? null
    : resolveCrossStepIntent(args.stepId, latestUserText);
  const previousFastPathKind = resolvePreviousAssistantFastPathKind(args.messages);
  const fastPathKind = diagnosisMode
    ? null
    : resolvePreferredFastPathKind(
        args.stepId,
        latestUserText,
        crossStepIntent,
        previousFastPathKind,
      );
  const locationIntentQuery =
    args.stepId === 'basics' ? extractLocationIntentQuery(latestUserText) : null;
  const forcePoliciesFollowUpProposal =
    !diagnosisMode &&
    args.stepId === 'policies' &&
    (countRequestedPolicyKinds(latestUserText) > 1 ||
      hasExplicitDeferralConstraint(latestUserText));
  const forceBasicsFollowUpProposal =
    !diagnosisMode &&
    !fastPathKind &&
    shouldForceBasicsFollowUpProposal(args.stepId, latestUserText, locationIntentQuery);
  const isCopyHeavyStep =
    args.stepId === 'policies' || args.stepId === 'content' || args.stepId === 'review';
  const fastModelName = process.env.EVENT_AI_WIZARD_FAST_MODEL || 'gpt-5-nano';
  const copyModelName =
    process.env.EVENT_AI_WIZARD_COPY_MODEL || process.env.EVENT_AI_WIZARD_MODEL || 'gpt-5-mini';
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

  const deterministicHandler = diagnosisMode
    ? 'step_diagnosis'
    : forceBasicsFollowUpProposal
      ? 'basics_follow_up'
      : forcePoliciesFollowUpProposal
        ? 'policies_follow_up'
        : null;

  const mode = diagnosisMode
    ? 'diagnosis'
    : deterministicHandler
      ? 'deterministic_follow_up'
      : fastPathKind
        ? 'fast_path_generation'
        : 'general_generation';

  const forcedToolByFastPathKind: Record<string, EventAiWizardForcedToolName> = {
    event_description: 'proposeDescriptionPatch',
    faq: 'proposeFaqPatch',
    content_bundle: 'proposeContentBundlePatch',
    website_overview: 'proposeWebsiteOverviewPatch',
    policy: 'proposePolicyPatch',
  };

  return {
    stepId: args.stepId,
    locale,
    latestUserIntent: latestUserText,
    mode,
    latestUserText,
    resolvedEventBrief,
    crossStepIntent,
    fastPathKind,
    deterministicHandler,
    locationIntentQuery,
    contextScope: {
      includeWebsiteContent: true,
      includeQuestions: true,
      includeAddOns: true,
      includeLocationContext: Boolean(locationIntentQuery),
      includePriorProposalContext: true,
    },
    modelPlan: {
      model: modelName,
      stepBudget,
      reasoningEffort: fastPathProviderOptions?.openai.reasoningEffort,
      textVerbosity: fastPathProviderOptions?.openai.textVerbosity,
      forcedTool: fastPathKind ? forcedToolByFastPathKind[fastPathKind] : undefined,
      providerOptions: fastPathProviderOptions,
    },
  };
}
