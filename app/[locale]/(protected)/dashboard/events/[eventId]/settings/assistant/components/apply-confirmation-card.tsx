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
    <div className="rounded-[28px] border border-emerald-500/20 bg-[color-mix(in_oklch,var(--background)_86%,oklch(0.92_0.05_160)_14%)] p-4 shadow-[0_18px_44px_rgba(16,185,129,0.08)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
        {t('appliedState.eyebrow')}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground">{appliedState.title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{appliedState.summary}</p>
      {appliedState.action ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {appliedState.action.kind === 'editor' ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full rounded-2xl sm:w-auto"
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
              className="w-full rounded-2xl sm:w-auto"
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
