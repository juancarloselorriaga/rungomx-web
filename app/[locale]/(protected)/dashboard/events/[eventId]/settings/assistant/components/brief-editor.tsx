'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { BriefEditorProps } from '../shared';

export function BriefEditor({
  briefEditorId,
  briefEditorHintId,
  eventBrief,
  briefDraft,
  hasSavedBrief,
  hasBriefDraftChanges,
  isEditingBrief,
  isPersistingBrief,
  onBriefDraftChange,
  onStartEditing,
  onCancelEditing,
  onSave,
  onClear,
  onUseForStep,
}: BriefEditorProps) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  return (
    <details
      className="rounded-2xl border border-border/50 bg-muted/10 p-4 dark:border-white/8 dark:bg-white/[0.025]"
      open={isEditingBrief}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('brief.savedLabel')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t('brief.description')}</p>
          </div>

          {!isEditingBrief ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={(event) => {
                event.preventDefault();
                onStartEditing();
              }}
            >
              {hasSavedBrief ? t('brief.edit') : t('brief.add')}
            </Button>
          ) : null}
        </div>
      </summary>

      <div className="mt-4 border-t border-border/60 pt-4 dark:border-white/8">
        {isEditingBrief ? (
          <div className="space-y-3">
            <label htmlFor={briefEditorId} className="sr-only">
              {t('brief.inputLabel')}
            </label>
            <p id={briefEditorHintId} className="text-xs leading-5 text-muted-foreground">
              {t('brief.inputHint')}
            </p>
            <textarea
              id={briefEditorId}
              aria-describedby={briefEditorHintId}
              value={briefDraft}
              onChange={(event) => onBriefDraftChange(event.target.value)}
              rows={5}
              className={cn(
                'min-h-[136px] w-full resize-y rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm outline-none ring-offset-background transition dark:border-white/10 dark:bg-black/35 dark:shadow-none',
                'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:opacity-60',
              )}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                size="sm"
                disabled={isPersistingBrief || !hasBriefDraftChanges}
                className="w-full sm:w-auto"
                onClick={onSave}
              >
                {t('brief.save')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isPersistingBrief}
                className="w-full sm:w-auto"
                onClick={onCancelEditing}
              >
                {t('brief.cancel')}
              </Button>
            </div>
          </div>
        ) : hasSavedBrief ? (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{eventBrief}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={onUseForStep}
              >
                {t('brief.useForStep')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isPersistingBrief}
                className="w-full sm:w-auto"
                onClick={onClear}
              >
                {t('brief.clear')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-foreground">{t('brief.empty')}</p>
            <p className="text-xs leading-5 text-muted-foreground">{t('brief.emptyHint')}</p>
          </div>
        )}
      </div>
    </details>
  );
}
