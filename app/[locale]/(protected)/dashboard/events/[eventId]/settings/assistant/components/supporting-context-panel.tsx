'use client';

import { MarkdownContent } from '@/components/markdown/markdown-content';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { getMessageText, type SupportingContextProps } from '../shared';

function MessageBubble({
  message,
}: {
  message: Pick<SupportingContextProps['archiveMessages'][number], 'id' | 'role' | 'parts'>;
}) {
  const text = getMessageText(message);

  if (!text) return null;

  return (
    <div
      className={cn(
        'rounded-[24px] border px-4 py-4 text-sm leading-relaxed',
        message.role === 'user'
          ? 'border-border/60 bg-muted/20 text-foreground'
          : 'border-border/60 bg-background/90 text-foreground',
      )}
    >
      <p className="whitespace-pre-wrap leading-6">{text}</p>
    </div>
  );
}

function ConversationExcerpt({
  label,
  text,
  renderMarkdown = false,
}: {
  label?: string;
  text: string;
  renderMarkdown?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background px-3 py-3">
      {label ? (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      ) : null}
      {renderMarkdown ? (
        <MarkdownContent
          content={text}
          className={cn(
            'text-sm leading-6 text-foreground prose-p:my-0 prose-headings:my-0 prose-ul:my-2 prose-li:my-1',
            label ? 'mt-2' : '',
          )}
        />
      ) : (
        <p
          className={cn(
            'whitespace-pre-wrap text-sm leading-6 text-foreground',
            label ? 'mt-2' : '',
          )}
        >
          {text}
        </p>
      )}
    </div>
  );
}

export function SupportingContextPanel({
  latestRequestMessage,
  latestProposalMessage,
  latestProposalText,
  archiveMessages,
}: SupportingContextProps) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  if (!latestRequestMessage && !latestProposalText && !archiveMessages.length) return null;

  return (
    <details className="group rounded-[28px] border border-border/60 bg-muted/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {t('latestProposal.supportingContextTitle')}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('latestProposal.supportingContextDescription', { count: archiveMessages.length })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {archiveMessages.length ? (
              <span className="rounded-full border border-border/50 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {archiveMessages.length}
              </span>
            ) : null}
            <span className="text-xs font-medium text-muted-foreground group-open:hidden">
              {t('archive.expand')}
            </span>
            <span className="hidden text-xs font-medium text-muted-foreground group-open:inline">
              {t('archive.collapse')}
            </span>
          </div>
        </div>
      </summary>

      <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
        {latestRequestMessage ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('latestProposal.requestLabel')}
            </p>
            <MessageBubble message={latestRequestMessage} />
          </div>
        ) : null}

        {latestProposalText && latestProposalMessage ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('latestProposal.responseLabel')}
            </p>
            <ConversationExcerpt text={latestProposalText} renderMarkdown />
          </div>
        ) : null}

        {archiveMessages.length ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('archive.title')}
            </p>
            <div className="space-y-3">
              {archiveMessages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
