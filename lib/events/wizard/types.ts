export type { EventSetupWizardStepDefinition, EventSetupWizardStepId } from './steps';

import type { EventSetupWizardStepId } from './steps';

export type EventCreationPath = 'ai' | 'manual';

export type EventWizardRegistryLabelKey =
  | 'wizard.registry.choosePath'
  | 'wizard.registry.eventDetails'
  | 'wizard.registry.distances'
  | 'wizard.registry.pricing'
  | 'wizard.registry.faq'
  | 'wizard.registry.waivers'
  | 'wizard.registry.questions'
  | 'wizard.registry.policies'
  | 'wizard.registry.website'
  | 'wizard.registry.addOns'
  | 'wizard.registry.publish';

export type EventWizardIssueLabelKey =
  | 'wizard.issues.missingEventDate'
  | 'wizard.issues.missingEventEndDate'
  | 'wizard.issues.missingEventLocation'
  | 'wizard.issues.missingEventDescription'
  | 'wizard.issues.missingHeroImage'
  | 'wizard.issues.missingDistance'
  | 'wizard.issues.publishMissingDistance'
  | 'wizard.issues.publishMissingPricing'
  | 'wizard.issues.publishActiveAddOnWithoutOptions'
  | 'wizard.issues.publishLocationNeedsVenueConfirmation'
  | 'wizard.issues.publishContentScheduleTruthConflict'
  | 'wizard.issues.publishContentLocationTruthConflict'
  | 'wizard.issues.recommendPricingWindows'
  | 'wizard.issues.recommendFaq'
  | 'wizard.issues.recommendWaivers'
  | 'wizard.issues.recommendQuestions'
  | 'wizard.issues.recommendWebsite'
  | 'wizard.issues.recommendAddOns'
  | 'wizard.issues.recommendPolicies';

export type EventWizardStepId =
  | 'choose_path'
  | 'event_details'
  | 'distances'
  | 'pricing'
  | 'faq'
  | 'waivers'
  | 'questions'
  | 'policies'
  | 'website'
  | 'add_ons'
  | 'publish';

export type EventWizardStep = {
  id: EventWizardStepId;
  labelKey: EventWizardRegistryLabelKey;
  href: string;
  required: boolean;
  paths: EventCreationPath[];
  reuseTarget: string;
};

export type EventWizardIssue = {
  id: string;
  stepId: EventWizardStepId;
  labelKey: EventWizardIssueLabelKey;
  href: string;
  code: string;
  severity: 'required' | 'blocker' | 'optional';
};

export type EventWizardCompleteness = {
  missingRequired: EventWizardIssue[];
  publishBlockers: EventWizardIssue[];
  optionalRecommendations: EventWizardIssue[];
  prioritizedChecklist: EventWizardIssue[];
  completionByStepId: Record<EventWizardStepId, boolean>;
  progress: {
    completedRequired: number;
    totalRequired: number;
    percent: number;
  };
};

export type EventWizardCapabilityLocks = {
  canUseAiAssistant: boolean;
  canApplyAiPatch: boolean;
  canPublishEvent: boolean;
  canEditEventConfig: boolean;
  canEditRegistration: boolean;
};

export type EventSetupWizardStepState = {
  id: EventSetupWizardStepId;
  required: boolean;
  completed: boolean;
  blockerCount: number;
  recommendationCount: number;
};

export type EventWizardAggregate = EventWizardCompleteness & {
  setupStepStateById: Record<EventSetupWizardStepId, EventSetupWizardStepState>;
  stepDiagnosisById?: Partial<Record<EventSetupWizardStepId, EventWizardIssue[]>>;
  capabilityLocks: EventWizardCapabilityLocks;
};

export type EventWizardStepModule = {
  id: EventWizardStepId;
  labelKey: EventWizardRegistryLabelKey;
  required: boolean;
  paths: EventCreationPath[];
  routeSuffix:
    | ''
    | '/settings'
    | '/pricing'
    | '/faq'
    | '/waivers'
    | '/questions'
    | '/policies'
    | '/website'
    | '/add-ons';
  reuseTarget: string;
};
