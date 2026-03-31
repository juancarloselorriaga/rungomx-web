'use client';

import { DefaultChatTransport } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useMemo, useState } from 'react';

import type {
  EventAiWizardEarlyProseLead,
  EventAiWizardFastPathStructure,
  EventAiWizardNotificationCode,
  EventAiWizardUIMessage,
} from '@/lib/events/ai-wizard/ui-types';

import type { EventAiWizardLatencyMarks, EventAiWizardProgressState } from './shared';

export function useEventAiWizardTransport(params: {
  editionId: string;
  stepId: string;
  locale: string;
  eventBrief: string;
}) {
  const { editionId, stepId, locale, eventBrief } = params;
  const [progressState, setProgressState] = useState<EventAiWizardProgressState | null>(null);
  const [fastPathStructure, setFastPathStructure] = useState<EventAiWizardFastPathStructure | null>(
    null,
  );
  const [earlyProseLead, setEarlyProseLead] = useState<EventAiWizardEarlyProseLead | null>(null);
  const [latencyMarks, setLatencyMarks] = useState<EventAiWizardLatencyMarks>({
    requestStartedAt: null,
    firstProgressAt: null,
    firstStructureAt: null,
    firstTextAt: null,
    proposalReadyAt: null,
  });

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/events/ai-wizard',
        body: { editionId, stepId, locale, eventBrief: eventBrief.trim() || null },
      }),
    [editionId, eventBrief, locale, stepId],
  );

  const chat = useChat<EventAiWizardUIMessage>({
    transport,
    onData: (part) => {
      if (part.type === 'data-notification') {
        setLatencyMarks((current) =>
          current.requestStartedAt && !current.firstProgressAt
            ? { ...current, firstProgressAt: Date.now() }
            : current,
        );
        setProgressState(
          part.data as { code: EventAiWizardNotificationCode; level: 'info' | 'success' | 'error' },
        );
        return;
      }

      if (part.type === 'data-fast-path-structure') {
        setFastPathStructure(part.data as EventAiWizardFastPathStructure);
        setLatencyMarks((current) =>
          current.requestStartedAt && !current.firstStructureAt
            ? { ...current, firstStructureAt: Date.now() }
            : current,
        );
        return;
      }

      if (part.type === 'data-early-prose') {
        setEarlyProseLead(part.data as EventAiWizardEarlyProseLead);
      }
    },
  });

  return {
    ...chat,
    progressState,
    setProgressState,
    fastPathStructure,
    setFastPathStructure,
    earlyProseLead,
    setEarlyProseLead,
    latencyMarks,
    setLatencyMarks,
  };
}
