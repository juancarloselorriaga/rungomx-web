import { buildResolvedLocationEditionData } from '@/lib/events/ai-wizard/server/proposals/finalize/location-choice';
import type { EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';

import type { EventAiWizardApplyLocationChoice } from '@/lib/events/ai-wizard/schemas';

type ResolveLocationChoiceResult =
  | { ok: true; patch: EventAiWizardPatch }
  | {
      ok: false;
      details: {
        reason: 'MISSING_LOCATION_CHOICE' | 'INVALID_LOCATION_CHOICE';
        optionIndex?: number;
      };
    };

export function resolveLocationChoice(params: {
  patch: EventAiWizardPatch;
  locationChoice?: EventAiWizardApplyLocationChoice;
}): ResolveLocationChoiceResult {
  const { patch, locationChoice } = params;
  const choiceRequest = patch.choiceRequest;

  if (!choiceRequest || choiceRequest.kind !== 'location_candidate_selection') {
    return { ok: true, patch };
  }

  if (!locationChoice) {
    return {
      ok: false,
      details: { reason: 'MISSING_LOCATION_CHOICE' },
    };
  }

  const selectedCandidate = choiceRequest.options[locationChoice.optionIndex];

  if (!selectedCandidate) {
    return {
      ok: false,
      details: {
        reason: 'INVALID_LOCATION_CHOICE',
        optionIndex: locationChoice.optionIndex,
      },
    };
  }

  const updateEditionIndex = patch.ops.findIndex((op) => op.type === 'update_edition');

  if (updateEditionIndex === -1) {
    return {
      ok: false,
      details: {
        reason: 'INVALID_LOCATION_CHOICE',
        optionIndex: locationChoice.optionIndex,
      },
    };
  }

  const updateEditionOp = patch.ops[updateEditionIndex];
  if (!updateEditionOp || updateEditionOp.type !== 'update_edition') {
    return {
      ok: false,
      details: {
        reason: 'INVALID_LOCATION_CHOICE',
        optionIndex: locationChoice.optionIndex,
      },
    };
  }

  const nextOps = [...patch.ops];
  nextOps[updateEditionIndex] = {
    ...updateEditionOp,
    data: {
      ...updateEditionOp.data,
      ...buildResolvedLocationEditionData(selectedCandidate),
    },
  };

  return {
    ok: true,
    patch: {
      ...patch,
      ops: nextOps,
      locationResolution: {
        status: 'matched',
        query: choiceRequest.query,
        candidate: selectedCandidate,
      },
      choiceRequest: undefined,
    },
  };
}
