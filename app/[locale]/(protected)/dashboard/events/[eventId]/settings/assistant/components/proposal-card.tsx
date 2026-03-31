'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { useEventAiWizardApply } from '../use-event-ai-wizard-apply';
import { useEventAiWizardLocationChoice } from '../use-event-ai-wizard-location-choice';
import { type ProposalCardPatchProps } from '../shared';
import { ProposalDetails } from './proposal-details';

export function ProposalCard(props: ProposalCardPatchProps & { router: { refresh: () => void } }) {
  const {
    editionId,
    patchId,
    patch,
    locale,
    activeStepId,
    applied,
    onApplyStart,
    onApplied,
    onApplyFailure,
    onRevealEditor,
    onNavigateToStep,
    onRequestManualClarification,
    router,
  } = props;
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  const { selectedCandidate, locationChoice, requiresLocationSelection, selectCandidate } =
    useEventAiWizardLocationChoice(patch);
  const { isApplying, applyPatch } = useEventAiWizardApply({
    editionId,
    locale,
    activeStepId,
    router,
    t: (key) => t(key as never),
    onRevealEditor,
    onApplied,
    onApplyFailure,
  });

  const locationResolution = selectedCandidate
    ? {
        status: 'matched' as const,
        query:
          patch.choiceRequest?.query ??
          patch.locationResolution?.query ??
          selectedCandidate.formattedAddress,
        candidate: selectedCandidate,
      }
    : patch.locationResolution;

  return (
    <article className="mt-3 rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--background)_96%,var(--primary)_4%),var(--background))] p-4 shadow-[0_18px_44px_rgba(15,23,42,0.08)] animate-in fade-in slide-in-from-bottom-1">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start">
        <div className="min-w-0 space-y-2">
          <p className="truncate text-base font-semibold text-foreground">{patch.title}</p>
          <p className="text-sm leading-6 text-muted-foreground">{patch.summary}</p>
        </div>
        <div className="w-full shrink-0 rounded-[24px] border border-border/50 bg-background/80 p-3">
          <p className="text-xs leading-5 text-muted-foreground">{t('trust.applyOnly')}</p>
          <Button
            type="button"
            size="sm"
            variant={applied ? 'secondary' : 'default'}
            disabled={isApplying || applied || requiresLocationSelection}
            onClick={() => applyPatch({ patchId, patch, applied, locationChoice, onApplyStart })}
            className="mt-3 w-full rounded-2xl"
          >
            {applied ? <Check className="mr-2 h-4 w-4" /> : null}
            {isApplying ? t('applying') : applied ? t('applied') : t('apply')}
          </Button>
        </div>
      </div>

      <div className="mt-4 border-t border-border/50 pt-4">
        <ProposalDetails
          patchId={patchId}
          patch={patch}
          locale={locale}
          locationResolution={locationResolution}
          selectedCandidate={selectedCandidate}
          onSelectLocationChoice={selectCandidate}
          onRevealEditor={onRevealEditor}
          onNavigateToStep={onNavigateToStep}
          onRequestManualClarification={onRequestManualClarification}
        />
      </div>
    </article>
  );
}
