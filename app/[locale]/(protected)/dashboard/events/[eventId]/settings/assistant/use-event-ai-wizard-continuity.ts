'use client';

import { useEffect, useState } from 'react';

import type { EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';
import type { EventAiWizardUIMessage } from '@/lib/events/ai-wizard/ui-types';

import type { EventAiAssistantStepId, EventAiWizardContinuitySnapshot } from './shared';

export function useEventAiWizardContinuity(params: {
  continuityStorageKey: string;
  stepId: EventAiAssistantStepId;
  latestRequestMessage: EventAiWizardUIMessage | null;
  latestProposalMessage: EventAiWizardUIMessage | null;
  latestProposalText: string;
  latestProposalPatch: Pick<EventAiWizardPatch, 'title' | 'summary'> | null;
  isBusy: boolean;
}) {
  const {
    continuityStorageKey,
    stepId,
    latestRequestMessage,
    latestProposalMessage,
    latestProposalText,
    latestProposalPatch,
    isBusy,
  } = params;

  const [continuitySnapshot] = useState<EventAiWizardContinuitySnapshot | null>(() => {
    if (typeof window === 'undefined') return null;

    const rawSnapshot = window.sessionStorage.getItem(continuityStorageKey);
    if (!rawSnapshot) return null;

    try {
      return JSON.parse(rawSnapshot) as EventAiWizardContinuitySnapshot;
    } catch {
      window.sessionStorage.removeItem(continuityStorageKey);
      return null;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!latestRequestMessage && !latestProposalMessage) return;

    const snapshot: EventAiWizardContinuitySnapshot = {
      sourceStepId: stepId,
      latestRequestMessage,
      latestProposalMessage,
      latestProposalText,
      latestProposalPatch,
    };

    window.sessionStorage.setItem(continuityStorageKey, JSON.stringify(snapshot));
  }, [
    continuityStorageKey,
    latestProposalMessage,
    latestProposalPatch,
    latestProposalText,
    latestRequestMessage,
    stepId,
  ]);

  const recoveredContinuitySnapshot =
    !latestProposalMessage &&
    !isBusy &&
    continuitySnapshot &&
    continuitySnapshot.sourceStepId !== stepId
      ? continuitySnapshot
      : null;

  return {
    recoveredContinuitySnapshot,
  };
}
