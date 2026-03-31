'use client';

import { useEffect, useState } from 'react';

import { updateEventEdition } from '@/lib/events/actions';

export function useEventAiWizardBrief(params: {
  editionId: string;
  briefStorageKey: string;
  initialEventBrief: string | null;
  onPersistSuccess: () => void;
  resolveBriefErrorMessage: (code?: string) => string;
  toastError: (message: string) => void;
}) {
  const {
    editionId,
    briefStorageKey,
    initialEventBrief,
    onPersistSuccess,
    resolveBriefErrorMessage,
    toastError,
  } = params;

  const normalizedInitialBrief = initialEventBrief?.trim() ?? '';
  const [eventBrief, setEventBrief] = useState(normalizedInitialBrief);
  const [briefDraft, setBriefDraft] = useState(normalizedInitialBrief);
  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [isPersistingBrief, setIsPersistingBrief] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const value = eventBrief.trim();
    if (!value) {
      window.sessionStorage.removeItem(briefStorageKey);
      return;
    }
    window.sessionStorage.setItem(briefStorageKey, value);
  }, [briefStorageKey, eventBrief]);

  async function persistEventBrief(nextBrief: string) {
    const trimmedBrief = nextBrief.trim();
    setIsPersistingBrief(true);
    const result = await updateEventEdition({ editionId, organizerBrief: trimmedBrief || null });
    setIsPersistingBrief(false);

    if (!result.ok) {
      toastError(resolveBriefErrorMessage(result.code));
      return false;
    }

    setEventBrief(trimmedBrief);
    setBriefDraft(trimmedBrief);
    setIsEditingBrief(false);
    onPersistSuccess();
    return true;
  }

  return {
    eventBrief,
    briefDraft,
    isEditingBrief,
    isPersistingBrief,
    hasSavedBrief: eventBrief.trim().length > 0,
    hasBriefDraftChanges: briefDraft.trim() !== eventBrief.trim(),
    setBriefDraft,
    startEditing: () => {
      setBriefDraft(eventBrief);
      setIsEditingBrief(true);
    },
    cancelEditing: () => {
      setBriefDraft(eventBrief);
      setIsEditingBrief(false);
    },
    persistEventBrief,
    saveBrief: async () => {
      if (briefDraft.trim() === eventBrief.trim()) {
        setIsEditingBrief(false);
        return;
      }

      await persistEventBrief(briefDraft);
    },
  };
}
