'use client';

import { Send, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { ComposerProps } from '../shared';

export function Composer({
  composerId,
  composerHintId,
  input,
  isBusy,
  suggestions,
  hasSavedBrief,
  composerRef,
  onInputChange,
  onSuggestionSelect,
  onSend,
  onStop,
}: ComposerProps) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  return (
    <section className="rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--background)_96%,var(--primary)_4%),var(--background))] px-4 py-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)] sm:px-5 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
      <label htmlFor={composerId} className="sr-only">
        {t('composer.label')}
      </label>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t('composer.sectionTitle')}
          </p>
          <p id={composerHintId} className="mt-2 text-sm leading-6 text-muted-foreground">
            {hasSavedBrief ? t('composer.savedBriefHint') : t('composer.briefHint')}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            <span className="font-medium text-foreground/85">{t('composer.roughNotesTitle')}</span>{' '}
            {t('composer.roughNotesExample')}
          </p>
        </div>

        <textarea
          id={composerId}
          ref={composerRef}
          aria-describedby={composerHintId}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={t('placeholder')}
          disabled={isBusy}
          rows={5}
          className={cn(
            'min-h-[150px] w-full resize-y rounded-[24px] border border-border/60 bg-background/90 px-4 py-3.5 text-sm leading-6 outline-none ring-offset-background transition sm:min-h-[180px] dark:border-primary/35 dark:bg-black/40 dark:shadow-none',
            'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:opacity-60',
          )}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />

        <div className="space-y-3">
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                type="button"
                size="sm"
                variant="outline"
                className="h-auto justify-start rounded-full border-border/60 bg-background/80 px-4 py-2.5 text-left text-sm leading-5 whitespace-normal sm:max-w-[24rem]"
                onClick={() => onSuggestionSelect(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-border/50 pt-3 sm:flex-row sm:items-center sm:justify-end">
            {isBusy ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onStop}
                className="w-full rounded-2xl sm:min-w-32 sm:w-auto"
              >
                <Square className="mr-2 size-4" />
                {t('stop')}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={onSend}
                disabled={input.trim().length === 0}
                className="w-full rounded-2xl sm:min-w-32 sm:w-auto"
              >
                <Send className="mr-2 size-4" />
                {t('send')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
