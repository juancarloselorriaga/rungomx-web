import type { EventAiWizardCrossStepIntent } from '@/lib/events/ai-wizard/schemas';
import type { EventAiWizardFastPathKind } from '@/lib/events/ai-wizard/ui-types';
import type { WebsiteContentBlocks } from '@/lib/events/website/types';
import type { EventSetupWizardStepId } from '@/lib/events/wizard/steps';

export type SupportedLocale = 'es' | 'en';

export type EventAiWizardExecutionMode =
  | 'diagnosis'
  | 'deterministic_follow_up'
  | 'fast_path_generation'
  | 'general_generation';

export type ExecutionMode = EventAiWizardExecutionMode;

export type EventAiWizardDeterministicHandler =
  | 'step_diagnosis'
  | 'basics_follow_up'
  | 'policies_follow_up';

export type EventAiWizardForcedToolName =
  | 'proposeDescriptionPatch'
  | 'proposeFaqPatch'
  | 'proposeContentBundlePatch'
  | 'proposeWebsiteOverviewPatch'
  | 'proposePolicyPatch';

export type EventAiWizardAggregateInput = {
  selectedPath: null;
  hasWebsiteContent: boolean;
  websiteContent: WebsiteContentBlocks | null;
  questionCount: number;
  addOnCount: number;
};

export type EventAiWizardExecutionPlan = {
  stepId: EventSetupWizardStepId;
  locale: string;
  latestUserIntent: string;
  mode: EventAiWizardExecutionMode;
  latestUserText: string;
  resolvedEventBrief: string | null;
  crossStepIntent: EventAiWizardCrossStepIntent | null;
  fastPathKind: EventAiWizardFastPathKind | null;
  deterministicHandler: EventAiWizardDeterministicHandler | null;
  locationIntentQuery: string | null;
  contextScope: {
    includeWebsiteContent: boolean;
    includeQuestions: boolean;
    includeAddOns: boolean;
    includeLocationContext: boolean;
    includePriorProposalContext: boolean;
  };
  modelPlan: {
    model: string;
    stepBudget: number;
    reasoningEffort?: 'minimal' | 'low' | 'medium';
    textVerbosity?: 'low';
    forcedTool?: EventAiWizardForcedToolName;
    providerOptions?: {
      openai: {
        reasoningEffort: 'minimal';
        textVerbosity: 'low';
      };
    };
  };
};

export type ExecutionPlan = EventAiWizardExecutionPlan;

export type EventAiWizardPlanningStepId = EventSetupWizardStepId;
