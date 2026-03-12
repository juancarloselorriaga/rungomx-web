import type { EventEditionDetail } from '@/lib/events/queries';
import { EVENT_WIZARD_STEP_MODULES } from './step-modules';
import type {
  EventCreationPath,
  EventSetupWizardStepId,
  EventWizardAggregate,
  EventWizardCapabilityLocks,
  EventWizardCompleteness,
  EventWizardIssue,
  EventWizardStep,
  EventWizardStepId,
} from './types';

export type {
  EventCreationPath,
  EventSetupWizardStepId,
  EventSetupWizardStepState,
  EventWizardAggregate,
  EventWizardCapabilityLocks,
  EventWizardCompleteness,
  EventWizardIssue,
  EventWizardIssueLabelKey,
  EventWizardRegistryLabelKey,
  EventWizardStep,
  EventWizardStepId,
  EventWizardStepModule,
} from './types';

function eventPath(eventId: string, suffix = ''): string {
  return `/dashboard/events/${eventId}${suffix}`;
}

export type EventWizardNavigationTarget = {
  pathname:
    | '/dashboard/events/[eventId]/settings'
    | '/dashboard/events/[eventId]/pricing'
    | '/dashboard/events/[eventId]/faq'
    | '/dashboard/events/[eventId]/waivers'
    | '/dashboard/events/[eventId]/policies'
    | '/dashboard/events/[eventId]/website'
    | '/dashboard/events/[eventId]/add-ons';
  params: { eventId: string };
  href: string;
  hardNavigation: boolean;
};

const OPTIONAL_RECOMMENDATION_DEFINITIONS: Array<{
  stepId: EventWizardStepId;
  code: string;
  labelKey: EventWizardIssue['labelKey'];
}> = [
  { stepId: 'faq', code: 'RECOMMEND_FAQ', labelKey: 'wizard.issues.recommendFaq' },
  { stepId: 'waivers', code: 'RECOMMEND_WAIVERS', labelKey: 'wizard.issues.recommendWaivers' },
  { stepId: 'questions', code: 'RECOMMEND_QUESTIONS', labelKey: 'wizard.issues.recommendQuestions' },
  { stepId: 'website', code: 'RECOMMEND_WEBSITE', labelKey: 'wizard.issues.recommendWebsite' },
  { stepId: 'add_ons', code: 'RECOMMEND_ADD_ONS', labelKey: 'wizard.issues.recommendAddOns' },
  { stepId: 'policies', code: 'RECOMMEND_POLICIES', labelKey: 'wizard.issues.recommendPolicies' },
];

const DEFAULT_CAPABILITY_LOCKS: EventWizardCapabilityLocks = {
  canUseAiAssistant: false,
  canApplyAiPatch: false,
  canPublishEvent: true,
  canEditEventConfig: true,
  canEditRegistration: true,
};

type EventWizardAggregateOptions = {
  selectedPath: EventCreationPath | null;
  hasWebsiteContent?: boolean;
  questionCount?: number;
  addOnCount?: number;
  capabilityLocks?: Partial<EventWizardCapabilityLocks>;
};

export function getEventWizardSteps(eventId: string): EventWizardStep[] {
  return EVENT_WIZARD_STEP_MODULES.map((module) => ({
    id: module.id,
    labelKey: module.labelKey,
    href: eventPath(eventId, module.routeSuffix),
    required: module.required,
    paths: module.paths,
    reuseTarget: module.reuseTarget,
  }));
}

export function resolveManualWizardStepTarget(
  steps: EventWizardStep[],
  completionByStepId: Record<EventWizardStepId, boolean>,
  selectedPath: EventCreationPath | null,
  requestedStepId: EventWizardStepId,
): EventWizardStepId {
  if (selectedPath !== 'manual') {
    return requestedStepId;
  }

  const requiredStepIds = steps.filter((step) => step.required).map((step) => step.id);
  if (!requiredStepIds.includes(requestedStepId)) {
    return requestedStepId;
  }

  const firstIncompleteRequiredStepId = requiredStepIds.find((stepId) => !completionByStepId[stepId]);
  if (!firstIncompleteRequiredStepId) {
    return requestedStepId;
  }

  const requestedStepIndex = requiredStepIds.indexOf(requestedStepId);
  const firstIncompleteIndex = requiredStepIds.indexOf(firstIncompleteRequiredStepId);

  if (requestedStepIndex > firstIncompleteIndex) {
    return firstIncompleteRequiredStepId;
  }

  return requestedStepId;
}

export function getWizardStepHref(eventId: string, stepId: EventWizardStepId): string {
  return getWizardStepNavigationTarget(eventId, stepId).href;
}

export function isWizardHardNavigationStep(stepId: EventWizardStepId): boolean {
  return stepId === 'questions';
}

export function getWizardStepNavigationTarget(
  eventId: string,
  stepId: EventWizardStepId,
): EventWizardNavigationTarget {
  switch (stepId) {
    case 'pricing':
      return {
        pathname: '/dashboard/events/[eventId]/pricing',
        params: { eventId },
        href: eventPath(eventId, '/pricing'),
        hardNavigation: false,
      };
    case 'faq':
      return {
        pathname: '/dashboard/events/[eventId]/faq',
        params: { eventId },
        href: eventPath(eventId, '/faq'),
        hardNavigation: false,
      };
    case 'waivers':
      return {
        pathname: '/dashboard/events/[eventId]/waivers',
        params: { eventId },
        href: eventPath(eventId, '/waivers'),
        hardNavigation: false,
      };
    case 'questions':
      return {
        pathname: '/dashboard/events/[eventId]/settings',
        params: { eventId },
        href: eventPath(eventId, '/questions'),
        hardNavigation: true,
      };
    case 'policies':
      return {
        pathname: '/dashboard/events/[eventId]/policies',
        params: { eventId },
        href: eventPath(eventId, '/policies'),
        hardNavigation: false,
      };
    case 'website':
      return {
        pathname: '/dashboard/events/[eventId]/website',
        params: { eventId },
        href: eventPath(eventId, '/website'),
        hardNavigation: false,
      };
    case 'add_ons':
      return {
        pathname: '/dashboard/events/[eventId]/add-ons',
        params: { eventId },
        href: eventPath(eventId, '/add-ons'),
        hardNavigation: false,
      };
    default:
      return {
        pathname: '/dashboard/events/[eventId]/settings',
        params: { eventId },
        href: eventPath(eventId, '/settings'),
        hardNavigation: false,
      };
  }
}

function buildSetupStepState(
  id: EventSetupWizardStepId,
  required: boolean,
  completed: boolean,
  blockerStepIds: Set<EventSetupWizardStepId>,
  recommendationStepIds: EventSetupWizardStepId[],
) {
  const recommendationCount = recommendationStepIds.filter((stepId) => stepId === id).length;
  return {
    id,
    required,
    completed,
    blockerCount: blockerStepIds.has(id) ? 1 : 0,
    recommendationCount,
  };
}

function mapIssueToSetupStepId(stepId: EventWizardStepId): EventSetupWizardStepId {
  switch (stepId) {
    case 'event_details':
      return 'basics';
    case 'distances':
      return 'distances';
    case 'pricing':
      return 'pricing';
    case 'questions':
    case 'add_ons':
      return 'extras';
    case 'faq':
    case 'website':
      return 'content';
    case 'waivers':
    case 'policies':
      return 'policies';
    case 'publish':
      return 'review';
    default:
      return 'basics';
  }
}

export function buildEventWizardAggregate(
  event: EventEditionDetail,
  {
    selectedPath,
    hasWebsiteContent = false,
    questionCount = 0,
    addOnCount = 0,
    capabilityLocks = {},
  }: EventWizardAggregateOptions,
): EventWizardAggregate {
  const steps = getEventWizardSteps(event.id);
  const stepById = new Map(steps.map((step) => [step.id, step]));

  const hasLocation = Boolean(event.locationDisplay || event.city || event.state);
  const hasDistances = event.distances.length > 0;
  const hasMissingPricing = event.distances.some((distance) => distance.hasPricingTier === false);
  const hasRegistrationConfig = Boolean(
    event.registrationOpensAt || event.registrationClosesAt || event.isRegistrationPaused,
  );
  const hasContent = hasWebsiteContent || event.faqItems.length > 0 || Boolean(event.description?.trim());
  const hasPolicies = event.policyConfig !== null || event.waivers.length > 0;
  const hasExtras = questionCount > 0 || addOnCount > 0;

  const missingRequired: EventWizardIssue[] = [];
  if (!event.startsAt) {
    missingRequired.push({
      id: 'missing-event-date',
      stepId: 'event_details',
      labelKey: 'wizard.issues.missingEventDate',
      href: stepById.get('event_details')?.href ?? eventPath(event.id, '/settings'),
      code: 'MISSING_EVENT_DATE',
      severity: 'required',
    });
  }
  if (!hasLocation) {
    missingRequired.push({
      id: 'missing-event-location',
      stepId: 'event_details',
      labelKey: 'wizard.issues.missingEventLocation',
      href: stepById.get('event_details')?.href ?? eventPath(event.id, '/settings'),
      code: 'MISSING_EVENT_LOCATION',
      severity: 'required',
    });
  }
  if (!hasDistances) {
    missingRequired.push({
      id: 'missing-distance',
      stepId: 'distances',
      labelKey: 'wizard.issues.missingDistance',
      href: stepById.get('distances')?.href ?? eventPath(event.id, '/settings'),
      code: 'MISSING_DISTANCE',
      severity: 'required',
    });
  }

  const publishBlockers: EventWizardIssue[] = [];
  if (!hasDistances) {
    publishBlockers.push({
      id: 'publish-missing-distance',
      stepId: 'distances',
      labelKey: 'wizard.issues.publishMissingDistance',
      href: stepById.get('distances')?.href ?? eventPath(event.id, '/settings'),
      code: 'MISSING_DISTANCE',
      severity: 'blocker',
    });
  }
  if (hasMissingPricing) {
    publishBlockers.push({
      id: 'publish-missing-pricing',
      stepId: 'pricing',
      labelKey: 'wizard.issues.publishMissingPricing',
      href: stepById.get('pricing')?.href ?? eventPath(event.id, '/pricing'),
      code: 'MISSING_PRICING',
      severity: 'blocker',
    });
  }

  const completionByStepId: Record<EventWizardStepId, boolean> = {
    choose_path: selectedPath !== null,
    event_details: Boolean(event.startsAt && hasLocation),
    distances: hasDistances,
    pricing: hasDistances && !hasMissingPricing,
    faq: event.faqItems.length > 0,
    waivers: event.waivers.length > 0,
    questions: questionCount > 0,
    policies: event.policyConfig !== null,
    website: hasWebsiteContent,
    add_ons: addOnCount > 0,
    publish: publishBlockers.length === 0,
  };

  const optionalRecommendations: EventWizardIssue[] = OPTIONAL_RECOMMENDATION_DEFINITIONS
    .filter((item) => !completionByStepId[item.stepId])
    .map((item) => ({
      id: `recommend-${item.stepId}`,
      stepId: item.stepId,
      labelKey: item.labelKey,
      href: stepById.get(item.stepId)?.href ?? eventPath(event.id, '/settings'),
      code: item.code,
      severity: 'optional',
    }));

  const prioritizedChecklist = [...publishBlockers, ...missingRequired, ...optionalRecommendations].filter(
    (issue, index, list) => list.findIndex((candidate) => candidate.code === issue.code) === index,
  );

  const requiredSteps = steps.filter((step) => step.required);
  const completedRequired = requiredSteps.filter((step) => completionByStepId[step.id]).length;
  const totalRequired = requiredSteps.length;
  const percent = totalRequired === 0 ? 100 : Math.round((completedRequired / totalRequired) * 100);

  const blockerStepIds = new Set([...publishBlockers, ...missingRequired].map((issue) => mapIssueToSetupStepId(issue.stepId)));
  const recommendationStepIds = optionalRecommendations.map((issue) => mapIssueToSetupStepId(issue.stepId));

  const setupStepStateById: EventWizardAggregate['setupStepStateById'] = {
    basics: buildSetupStepState('basics', true, completionByStepId.event_details, blockerStepIds, recommendationStepIds),
    distances: buildSetupStepState('distances', true, completionByStepId.distances, blockerStepIds, recommendationStepIds),
    pricing: buildSetupStepState('pricing', true, completionByStepId.pricing, blockerStepIds, recommendationStepIds),
    registration: buildSetupStepState('registration', false, hasRegistrationConfig, blockerStepIds, recommendationStepIds),
    policies: buildSetupStepState('policies', false, hasPolicies, blockerStepIds, recommendationStepIds),
    content: buildSetupStepState('content', false, hasContent, blockerStepIds, recommendationStepIds),
    extras: buildSetupStepState('extras', false, hasExtras, blockerStepIds, recommendationStepIds),
    review: buildSetupStepState('review', true, publishBlockers.length === 0, blockerStepIds, recommendationStepIds),
  };

  return {
    missingRequired,
    publishBlockers,
    optionalRecommendations,
    prioritizedChecklist,
    completionByStepId,
    setupStepStateById,
    capabilityLocks: {
      ...DEFAULT_CAPABILITY_LOCKS,
      ...capabilityLocks,
    },
    progress: {
      completedRequired,
      totalRequired,
      percent,
    },
  };
}

export function evaluateEventWizardCompleteness(
  event: EventEditionDetail,
  selectedPath: EventCreationPath | null,
): EventWizardCompleteness {
  return buildEventWizardAggregate(event, { selectedPath });
}
