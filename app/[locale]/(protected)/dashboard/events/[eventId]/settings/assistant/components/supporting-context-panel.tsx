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
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const text = getMessageText(message);

  if (!text) return null;

  const roleLabel = message.role === 'user' ? t('messages.user') : t('messages.assistant');

  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3 text-sm leading-relaxed',
        message.role === 'user'
          ? 'border-border/60 bg-muted/20 text-foreground'
          : 'border-border/60 bg-background text-foreground',
      )}
    >
      <p className="sr-only">{roleLabel}</p>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function ConversationExcerpt({
  label,
  text,
  renderMarkdown = false,
}: {
  label: string;
  text: string;
  renderMarkdown?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {renderMarkdown ? (
        <MarkdownContent
          content={text}
          className="mt-2 text-sm leading-6 text-foreground prose-p:my-0 prose-headings:my-0 prose-ul:my-2 prose-li:my-1"
        />
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{text}</p>
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
    <details className="group rounded-2xl border border-border/60 bg-muted/10 p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {t('latestProposal.supportingContextTitle')}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('latestProposal.supportingContextDescription', { count: archiveMessages.length })}
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground group-open:hidden">
            {t('archive.expand')}
          </span>
          <span className="hidden text-xs font-medium text-muted-foreground group-open:inline">
            {t('archive.collapse')}
          </span>
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
            <ConversationExcerpt
              label={t('latestProposal.responseLabel')}
              text={latestProposalText}
              renderMarkdown
            />
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
