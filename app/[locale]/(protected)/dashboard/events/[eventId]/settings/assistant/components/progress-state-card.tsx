'use client';

import { MarkdownContent } from '@/components/markdown/markdown-content';
import { useTranslations } from 'next-intl';

import type { EventAiWizardFastPathStructure } from '@/lib/events/ai-wizard/ui-types';
import { cn } from '@/lib/utils';

import { getMessageText, type ProgressStateCardProps } from '../shared';

function RequestSummaryCard({
  message,
}: {
  message: NonNullable<ProgressStateCardProps['latestVisibleUserMessage']>;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const text = getMessageText(message);

  if (!text) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/15 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('pending.requestLabel')}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{text}</p>
    </div>
  );
}

function AnimatedProgressLabel({
  label,
  description,
  emphasis,
}: {
  label: string;
  description: string;
  emphasis?: 'normal' | 'slow';
}) {
  const isSlow = emphasis === 'slow';

  return (
    <div className="px-1 py-1">
      <div className="flex items-center gap-2">
        <span className="assistant-working-dot mt-0.5 size-2.5 shrink-0 rounded-full bg-primary/35" />
        <p
          className={cn(
            'assistant-working-label text-sm font-semibold italic',
            isSlow && 'opacity-95',
          )}
        >
          {label}
        </p>
      </div>
      <p
        className={cn(
          'mt-1.5 text-sm leading-6 italic text-muted-foreground/90',
          isSlow && 'text-muted-foreground',
        )}
      >
        {description}
      </p>
    </div>
  );
}

function FastPathStructureCard({ structure }: { structure: EventAiWizardFastPathStructure }) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const sectionBaseKey = `fastPath.${structure.kind}.sections` as const;

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/10 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        {t('fastPath.eyebrow')}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {t(`fastPath.${structure.kind}.title` as never)}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {t(`fastPath.${structure.kind}.description` as never)}
      </p>
      <ul className="mt-3 space-y-2 text-sm text-foreground">
        {structure.sectionKeys.map((sectionKey) => (
          <li key={sectionKey} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-foreground/70" />
            <span>{t(`${sectionBaseKey}.${sectionKey}` as never)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SlowProposalScaffoldCard({
  scaffoldKey,
}: {
  scaffoldKey: NonNullable<ProgressStateCardProps['slowScaffoldKey']>;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const sectionBaseKey = `scaffold.${scaffoldKey}.sections` as const;
  const sectionKeys = ['first_pass', 'confirmed_facts', 'open_points'] as const;

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/10 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('scaffold.eyebrow')}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {t(`scaffold.${scaffoldKey}.title` as never)}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {t(`scaffold.${scaffoldKey}.description` as never)}
      </p>
      <ul className="mt-3 space-y-2 text-sm text-foreground">
        {sectionKeys.map((sectionKey) => (
          <li key={sectionKey} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />
            <span>{t(`${sectionBaseKey}.${sectionKey}` as never)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EarlyProseLeadCard({
  lead,
}: {
  lead: NonNullable<ProgressStateCardProps['earlyProseLead']>;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/10 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        {t('earlyProse.eyebrow')}
      </p>
      <p className="mt-2 text-sm leading-6 text-foreground">{lead.body}</p>
    </div>
  );
}

export function ProgressStateCard({
  latestVisibleUserMessage,
  latestAssistantWithoutPatch,
  visibleProgressLabel,
  visibleProgressDescription,
  progressEmphasis,
  showAnimatedProgress,
  earlyProseLead,
  fastPathStructure,
  slowScaffoldKey,
}: ProgressStateCardProps) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  return (
    <section className="rounded-2xl border border-border/60 bg-background p-4 dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('latestProposal.pendingTitle')}
      </p>
      <div className="mt-3 space-y-3">
        {latestVisibleUserMessage ? (
          <RequestSummaryCard message={latestVisibleUserMessage} />
        ) : null}
        {showAnimatedProgress && visibleProgressLabel && visibleProgressDescription ? (
          <AnimatedProgressLabel
            label={visibleProgressLabel}
            description={visibleProgressDescription}
            emphasis={progressEmphasis}
          />
        ) : null}
        {earlyProseLead ? <EarlyProseLeadCard lead={earlyProseLead} /> : null}
        {fastPathStructure ? <FastPathStructureCard structure={fastPathStructure} /> : null}
        {slowScaffoldKey ? <SlowProposalScaffoldCard scaffoldKey={slowScaffoldKey} /> : null}
        {latestAssistantWithoutPatch ? (
          <div className="rounded-xl border border-border/60 bg-background px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('latestProposal.responseLabel')}
            </p>
            <MarkdownContent
              content={latestAssistantWithoutPatch}
              className="mt-2 text-sm leading-6 text-foreground"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
