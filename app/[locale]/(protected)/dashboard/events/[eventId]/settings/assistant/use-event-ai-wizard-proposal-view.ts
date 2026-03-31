'use client';

import { useMemo } from 'react';

import type { EventAiWizardUIMessage } from '@/lib/events/ai-wizard/ui-types';

import { getMessageText, isEventPatchPart } from './shared';

export function useEventAiWizardProposalView(messages: EventAiWizardUIMessage[]) {
  const renderedMessages = useMemo(
    () => messages.filter((message) => message.role !== 'system'),
    [messages],
  );

  const latestUserMessageIndex = useMemo(() => {
    for (let index = renderedMessages.length - 1; index >= 0; index -= 1) {
      if (renderedMessages[index]?.role === 'user') return index;
    }
    return -1;
  }, [renderedMessages]);

  const latestVisibleUserMessage =
    latestUserMessageIndex >= 0 ? renderedMessages[latestUserMessageIndex] : null;

  const latestProposalMessageIndex = useMemo(() => {
    for (let index = renderedMessages.length - 1; index >= 0; index -= 1) {
      const message = renderedMessages[index];
      if (message.role === 'assistant' && message.parts.some(isEventPatchPart)) {
        return index;
      }
    }

    return -1;
  }, [renderedMessages]);

  const latestAuthoritativeProposalIndex =
    latestProposalMessageIndex >= 0 && latestProposalMessageIndex > latestUserMessageIndex
      ? latestProposalMessageIndex
      : -1;

  const latestProposalMessage =
    latestAuthoritativeProposalIndex >= 0
      ? renderedMessages[latestAuthoritativeProposalIndex]
      : null;

  const latestProposalPatchPart = latestProposalMessage
    ? ([...latestProposalMessage.parts.filter(isEventPatchPart)].at(-1) ?? null)
    : null;

  const latestProposalText = latestProposalMessage ? getMessageText(latestProposalMessage) : '';

  const latestRequestIndex = useMemo(() => {
    if (latestAuthoritativeProposalIndex < 0) return -1;

    for (let index = latestAuthoritativeProposalIndex - 1; index >= 0; index -= 1) {
      if (renderedMessages[index]?.role === 'user') return index;
    }

    return -1;
  }, [latestAuthoritativeProposalIndex, renderedMessages]);

  const latestRequestMessage =
    latestRequestIndex >= 0 ? renderedMessages[latestRequestIndex] : null;

  const archiveMessages = useMemo(() => {
    if (latestAuthoritativeProposalIndex < 0) {
      return renderedMessages;
    }

    const cutoffIndex =
      latestRequestIndex >= 0 ? latestRequestIndex : latestAuthoritativeProposalIndex;
    return renderedMessages.slice(0, cutoffIndex);
  }, [latestAuthoritativeProposalIndex, latestRequestIndex, renderedMessages]);

  const latestAssistantWithoutPatch = useMemo(() => {
    if (latestProposalMessage) return null;

    for (let index = renderedMessages.length - 1; index >= 0; index -= 1) {
      const message = renderedMessages[index];
      if (message?.role !== 'assistant') continue;
      if (index <= latestUserMessageIndex) return null;
      const text = getMessageText(message);
      if (text) return text;
    }

    return null;
  }, [latestProposalMessage, latestUserMessageIndex, renderedMessages]);

  return {
    renderedMessages,
    latestVisibleUserMessage,
    latestProposalMessage,
    latestProposalPatchPart,
    latestProposalText,
    latestRequestMessage,
    archiveMessages,
    latestAssistantWithoutPatch,
  };
}
