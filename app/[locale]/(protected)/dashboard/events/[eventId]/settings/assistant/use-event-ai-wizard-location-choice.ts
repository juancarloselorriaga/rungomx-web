'use client';

import { useMemo, useState } from 'react';

import type {
  EventAiWizardApplyLocationChoice,
  EventAiWizardPatch,
} from '@/lib/events/ai-wizard/schemas';

import type { EventAiWizardResolvedLocationCandidate } from './shared';

export function useEventAiWizardLocationChoice(patch: EventAiWizardPatch) {
  const currentChoiceKey = useMemo(() => {
    if (patch.choiceRequest?.kind !== 'location_candidate_selection') return null;

    return JSON.stringify({
      query: patch.choiceRequest.query,
      options: patch.choiceRequest.options.map((option) => ({
        formattedAddress: option.formattedAddress,
        placeId: option.placeId ?? null,
      })),
    });
  }, [patch.choiceRequest]);

  const [selectionState, setSelectionState] = useState<{
    choiceKey: string | null;
    optionIndex: number | null;
  }>({
    choiceKey: null,
    optionIndex: null,
  });

  const selectedOptionIndex =
    currentChoiceKey && selectionState.choiceKey === currentChoiceKey
      ? selectionState.optionIndex
      : null;

  const selectedCandidate = useMemo<EventAiWizardResolvedLocationCandidate | null>(() => {
    if (patch.choiceRequest?.kind !== 'location_candidate_selection') return null;
    if (selectedOptionIndex === null) return null;
    return patch.choiceRequest.options[selectedOptionIndex] ?? null;
  }, [patch.choiceRequest, selectedOptionIndex]);

  const locationChoice = useMemo<EventAiWizardApplyLocationChoice | undefined>(() => {
    if (patch.choiceRequest?.kind !== 'location_candidate_selection') return undefined;
    if (selectedOptionIndex === null) return undefined;
    return { optionIndex: selectedOptionIndex };
  }, [patch.choiceRequest, selectedOptionIndex]);

  const requiresLocationSelection =
    patch.choiceRequest?.kind === 'location_candidate_selection' && locationChoice === undefined;

  return {
    selectedCandidate,
    locationChoice,
    requiresLocationSelection,
    selectCandidate: (optionIndex: number) =>
      setSelectionState({
        choiceKey: currentChoiceKey,
        optionIndex,
      }),
  };
}
