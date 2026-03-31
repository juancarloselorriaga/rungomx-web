'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import type { ApplyConfirmationProps } from '../shared';

export function ApplyConfirmationCard({
  appliedState,
  onRevealEditor,
  onNavigateToStep,
}: ApplyConfirmationProps) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const tPage = useTranslations('pages.dashboardEventSettings');

  const stepActionLabel =
    appliedState.action?.kind === 'step'
      ? t('appliedState.goToStep', {
          step: tPage(`wizardShell.steps.${appliedState.action.stepId}` as never),
        })
      : null;

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
        {t('appliedState.eyebrow')}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{appliedState.title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{appliedState.summary}</p>
      {appliedState.action ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {appliedState.action.kind === 'editor' ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                onRevealEditor(
                  appliedState.action?.kind === 'editor' ? appliedState.action.target : undefined,
                )
              }
            >
              {t('appliedState.revealEditor')}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                onNavigateToStep(
                  appliedState.action?.kind === 'step' ? appliedState.action.stepId : 'basics',
                )
              }
            >
              {stepActionLabel}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
