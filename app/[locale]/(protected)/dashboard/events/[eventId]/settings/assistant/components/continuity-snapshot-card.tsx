'use client';

import { MarkdownContent } from '@/components/markdown/markdown-content';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { getMessageText, type ContinuitySnapshotProps } from '../shared';

export function ContinuitySnapshotCard({ snapshot, onReuseRequest }: ContinuitySnapshotProps) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const tPage = useTranslations('pages.dashboardEventSettings');
  const latestRequestText = snapshot.latestRequestMessage
    ? getMessageText(snapshot.latestRequestMessage)
    : '';

  return (
    <div className="rounded-[28px] border border-border/60 bg-muted/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t('continuity.eyebrow')}
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {t('continuity.title', {
              step: tPage(`wizardShell.steps.${snapshot.sourceStepId}` as never),
            })}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t('continuity.description')}
          </p>
        </div>
        {latestRequestText ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full rounded-2xl sm:w-auto"
            onClick={() => onReuseRequest(latestRequestText)}
          >
            {t('continuity.reuseRequest')}
          </Button>
        ) : null}
      </div>
      <div className="mt-3 space-y-3">
        {snapshot.latestRequestMessage && latestRequestText ? (
          <div className="rounded-[24px] border border-border/50 bg-background/60 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('latestProposal.requestLabel')}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
              {latestRequestText}
            </p>
          </div>
        ) : null}
        {snapshot.latestProposalPatch ? (
          <div className="rounded-[24px] border border-border/60 bg-background px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('continuity.proposalLabel')}
            </p>
            <MarkdownContent
              content={`${snapshot.latestProposalPatch.title}\n${snapshot.latestProposalPatch.summary}`}
              className="mt-2 text-sm leading-6 text-foreground prose-p:my-0 prose-headings:my-0 prose-ul:my-2 prose-li:my-1"
            />
          </div>
        ) : snapshot.latestProposalText ? (
          <div className="rounded-[24px] border border-border/60 bg-background px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('latestProposal.responseLabel')}
            </p>
            <MarkdownContent
              content={snapshot.latestProposalText}
              className="mt-2 text-sm leading-6 text-foreground prose-p:my-0 prose-headings:my-0 prose-ul:my-2 prose-li:my-1"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
