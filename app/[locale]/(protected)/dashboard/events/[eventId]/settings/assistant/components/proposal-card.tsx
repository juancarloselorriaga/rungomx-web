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
    <article className="mt-3 rounded-2xl border border-border/60 bg-background p-4 animate-in fade-in slide-in-from-bottom-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{patch.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{patch.summary}</p>
        </div>
        <div className="w-full shrink-0 space-y-2 sm:w-auto sm:min-w-[11rem]">
          <p className="text-xs leading-5 text-muted-foreground">{t('trust.applyOnly')}</p>
          <Button
            type="button"
            size="sm"
            variant={applied ? 'secondary' : 'default'}
            disabled={isApplying || applied || requiresLocationSelection}
            onClick={() => applyPatch({ patchId, patch, applied, locationChoice, onApplyStart })}
            className="w-full"
          >
            {applied ? <Check className="mr-2 h-4 w-4" /> : null}
            {isApplying ? t('applying') : applied ? t('applied') : t('apply')}
          </Button>
        </div>
      </div>

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
    </article>
  );
}
