import { getAddOnsForEdition } from '@/lib/events/add-ons/queries';
import { getQuestionsForEdition } from '@/lib/events/questions/queries';
import {
  resolveAiWizardLocationIntent,
  type EventAiWizardLocationResolution,
} from '@/lib/events/ai-wizard/location-resolution';
import { buildEventAiWizardSystemPrompt } from '@/lib/events/ai-wizard/server/prompt/build-system-prompt';
import { buildEventWizardAggregate } from '@/lib/events/wizard/orchestrator';
import { mapWizardIssueStepToSetupStep } from '@/lib/events/wizard/steps';
import type { EventEditionDetail } from '@/lib/events/queries';
import { getPublicWebsiteContent, hasWebsiteContent } from '@/lib/events/website/queries';
import { getDiagnosisNextStep } from '@/lib/events/ai-wizard/server/proposals/deterministic/build-step-diagnosis';
import type {
  EventAiWizardAggregateInput,
  EventAiWizardExecutionPlan,
  EventAiWizardPlanningStepId,
} from '../planning/types';

export async function buildScopedAssistantContext(args: {
  editionId: string;
  event: EventEditionDetail;
  stepId: EventAiWizardPlanningStepId;
  plan: EventAiWizardExecutionPlan;
}) {
  const [websiteContent, hasWebsiteContentFlag, questions, addOns, locationResolution] =
    await Promise.all([
      args.plan.contextScope.includeWebsiteContent
        ? getPublicWebsiteContent(args.editionId, args.plan.locale)
        : Promise.resolve(null),
      args.plan.contextScope.includeWebsiteContent
        ? hasWebsiteContent(args.editionId)
        : Promise.resolve(false),
      args.plan.contextScope.includeQuestions
        ? getQuestionsForEdition(args.editionId)
        : Promise.resolve([]),
      args.plan.contextScope.includeAddOns
        ? getAddOnsForEdition(args.editionId)
        : Promise.resolve([]),
      args.plan.contextScope.includeLocationContext && args.plan.locationIntentQuery
        ? resolveAiWizardLocationIntent(args.plan.locationIntentQuery, {
            locale: args.plan.locale,
            country: args.event.country ?? 'MX',
          })
        : Promise.resolve(null),
    ]);

  const aggregateInput: EventAiWizardAggregateInput = {
    selectedPath: null,
    hasWebsiteContent: hasWebsiteContentFlag,
    websiteContent,
    questionCount: questions.length,
    addOnCount: addOns.length,
  };
  const aggregate = buildEventWizardAggregate(args.event, aggregateInput);
  const diagnosisNextStep =
    args.plan.mode === 'diagnosis' ? getDiagnosisNextStep(args.stepId, aggregate) : null;
  const system = buildEventAiWizardSystemPrompt(args.event, {
    checklist: aggregate.prioritizedChecklist.map((issue) => ({
      ...issue,
      stepId: mapWizardIssueStepToSetupStep(issue.stepId),
    })),
    activeStepDiagnosis:
      aggregate.stepDiagnosisById?.[args.stepId]?.map((issue) => ({
        ...issue,
        stepId: mapWizardIssueStepToSetupStep(issue.stepId),
      })) ?? [],
    diagnosisNextStep,
    activeStepId: args.stepId,
    locale: args.plan.locale,
    websiteContent,
    eventBrief: args.plan.resolvedEventBrief,
    fastPathKind: args.plan.fastPathKind,
    compactMode: Boolean(
      args.plan.fastPathKind &&
      args.stepId !== 'basics' &&
      args.stepId !== 'distances' &&
      args.stepId !== 'pricing' &&
      args.stepId !== 'registration' &&
      args.stepId !== 'extras',
    ),
    locationResolution,
    diagnosisMode: args.plan.mode === 'diagnosis',
  });

  return {
    aggregateInput,
    aggregate,
    diagnosisNextStep,
    websiteContent,
    hasWebsiteContent: hasWebsiteContentFlag,
    questions,
    addOns,
    locationResolution: locationResolution as EventAiWizardLocationResolution | null,
    system,
  };
}
