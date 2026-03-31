'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import type {
  EventAiWizardApplyLocationChoice,
  EventAiWizardPatch,
} from '@/lib/events/ai-wizard/schemas';

import {
  buildAppliedState,
  type EventAiAssistantStepId,
  type EventAiWizardAppliedState,
  type EventAiWizardEditorFocusTarget,
} from './shared';

type RouterLike = {
  refresh: () => void;
};

export function useEventAiWizardApply(params: {
  editionId: string;
  locale: string;
  activeStepId: EventAiAssistantStepId;
  router: RouterLike;
  t: (key: string) => string;
  onRevealEditor: (target?: EventAiWizardEditorFocusTarget) => void;
  onApplied: (appliedState: EventAiWizardAppliedState) => void;
  onApplyFailure?: (message: string) => void;
}) {
  const { editionId, locale, activeStepId, router, t, onRevealEditor, onApplied, onApplyFailure } =
    params;
  const [isApplying, setIsApplying] = useState(false);

  async function applyPatch(args: {
    patchId: string;
    patch: EventAiWizardPatch;
    applied: boolean;
    locationChoice?: EventAiWizardApplyLocationChoice;
    onApplyStart?: () => void;
  }) {
    const { patchId, patch, applied, locationChoice, onApplyStart } = args;
    if (isApplying || applied) return;

    setIsApplying(true);
    onApplyStart?.();

    const appliedState = buildAppliedState({ patchId, patch, activeStepId, locationChoice });

    const handleApplyFailure = (message: string) => {
      toast.error(message);
      onApplyFailure?.(message);
    };

    try {
      const res = await fetch('/api/events/ai-wizard/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editionId, locale, patch, locationChoice }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          code?: string;
          category?: string;
          applied?: unknown;
        } | null;

        if (data?.code === 'PRO_REQUIRED') return handleApplyFailure(t('errors.proRequired'));
        if (data?.code === 'FEATURE_DISABLED') return handleApplyFailure(t('errors.disabled'));
        if (data?.code === 'RATE_LIMITED') return handleApplyFailure(t('errors.rateLimited'));
        if (data?.code === 'READ_ONLY') return handleApplyFailure(t('errors.readOnlyDescription'));
        if (data?.code === 'SAFETY_BLOCKED') {
          return handleApplyFailure(
            data.category === 'prompt_injection'
              ? t('errors.safety.promptInjection')
              : t('errors.safety.policyViolation'),
          );
        }
        if (data?.code === 'INVALID_PATCH') return handleApplyFailure(t('errors.invalid'));
        if (data?.code === 'RETRY_LATER') return handleApplyFailure(t('errors.retryLater'));

        if (Array.isArray(data?.applied) && data.applied.length > 0) {
          const message = t('errors.partialApplied');
          toast.error(message);
          onApplied(appliedState);
          router.refresh();
          onApplyFailure?.(message);
          return;
        }

        return handleApplyFailure(t('errors.failed'));
      }

      toast.success(t('applied'));
      const shouldRevealLocationInEditor =
        activeStepId === 'basics' &&
        (Boolean(locationChoice) ||
          patch.ops.some(
            (op) =>
              op.type === 'update_edition' &&
              Boolean(
                op.data.locationDisplay && op.data.latitude?.trim() && op.data.longitude?.trim(),
              ),
          ));
      const shouldRevealBasicsEditor =
        activeStepId === 'basics' && patch.ops.some((op) => op.type === 'update_edition');

      onApplied(appliedState);

      if (shouldRevealLocationInEditor) {
        onRevealEditor('location');
        return;
      }

      if (shouldRevealBasicsEditor) {
        onRevealEditor();
        return;
      }

      router.refresh();
    } finally {
      setIsApplying(false);
    }
  }

  return {
    isApplying,
    applyPatch,
  };
}
