import {
  mapWizardIssueStepToSetupStep,
  type EventSetupWizardStepId,
} from '@/lib/events/wizard/steps';

import type { EventAiWizardLocationResolution } from '@/lib/events/ai-wizard/location-resolution';
import type {
  EventAiWizardCrossStepIntent,
  EventAiWizardPatch,
} from '@/lib/events/ai-wizard/schemas';
import type { EventEditionDetail } from '@/lib/events/queries';

import { buildLocationChoiceRequest, sanitizeResolvedLocationForUi } from './location-choice';
import {
  projectAggregateFromProposal,
  type ProposalProjectionAggregateInput,
} from './project-aggregate-from-proposal';

function canonicalIntentForStep(stepId: EventSetupWizardStepId) {
  return `continue_${stepId}`;
}

function patchTouchesLocation(patch: EventAiWizardPatch) {
  return patch.ops.some(
    (op) =>
      op.type === 'update_edition' &&
      Boolean(
        op.data.locationDisplay ||
        op.data.address ||
        op.data.city ||
        op.data.state ||
        op.data.latitude ||
        op.data.longitude,
      ),
  );
}

export function finalizeProposalForUi(
  event: EventEditionDetail,
  patch: EventAiWizardPatch,
  aggregateInput: ProposalProjectionAggregateInput,
  resolvedLocation?: EventAiWizardLocationResolution | null,
  crossStepIntent?: EventAiWizardCrossStepIntent | null,
): EventAiWizardPatch {
  const touchesLocation = patchTouchesLocation(patch);
  const projectedAggregate = projectAggregateFromProposal(event, patch, aggregateInput);
  const projectedChecklist = [
    ...projectedAggregate.publishBlockers,
    ...projectedAggregate.missingRequired,
  ].map((issue) => ({
    code: issue.code,
    stepId: mapWizardIssueStepToSetupStep(issue.stepId),
    label: issue.labelKey,
    severity: issue.severity,
  }));

  const canonicalIntentRouting = projectedAggregate.optionalRecommendations
    .map((issue) => mapWizardIssueStepToSetupStep(issue.stepId))
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
    crossStepIntent: crossStepIntent ?? patch.crossStepIntent,
    locationResolution:
      resolvedLocation && touchesLocation
        ? sanitizeResolvedLocationForUi(resolvedLocation)
        : patch.locationResolution,
    choiceRequest:
      resolvedLocation?.status === 'ambiguous' && touchesLocation
        ? buildLocationChoiceRequest(resolvedLocation)
        : patch.choiceRequest,
  };
}
