'use client';

import { Badge } from '@/components/common/badge';
import type { OrganizerWalletIssueActivityItem } from '@/lib/payments/organizer/ui';
import {
  getOrganizerPayoutReasonFamily,
  humanizeTechnicalCode,
} from '@/lib/payments/organizer/presentation';
import { useTranslations } from 'next-intl';

type OrganizerActionQueueProps = {
  locale: 'es' | 'en';
  actionNeeded: OrganizerWalletIssueActivityItem[];
  inProgress: OrganizerWalletIssueActivityItem[];
};

type QueueSectionProps = {
  title: string;
  description: string;
  emptyMessage: string;
  items: OrganizerWalletIssueActivityItem[];
  badgeLabel: string;
  locale: 'es' | 'en';
};

function QueueSection({
  title,
  description,
  emptyMessage,
  items,
  badgeLabel,
  locale,
}: QueueSectionProps) {
  const t = useTranslations('pages.dashboardPayments');

  const eventTitleMap: Record<string, string> = {
    'payout.queued': t('wallet.queue.events.payoutQueued.title'),
    'payout.requested': t('wallet.queue.events.payoutRequested.title'),
    'payout.processing': t('wallet.queue.events.payoutProcessing.title'),
    'payout.paused': t('wallet.queue.events.payoutPaused.title'),
    'payout.resumed': t('wallet.queue.events.payoutResumed.title'),
    'payout.completed': t('wallet.queue.events.payoutCompleted.title'),
    'payout.failed': t('wallet.queue.events.payoutFailed.title'),
    'payout.adjusted': t('wallet.queue.events.payoutAdjusted.title'),
    'debt_control.pause_required': t('wallet.queue.events.debtPauseRequired.title'),
    'debt_control.resume_allowed': t('wallet.queue.events.debtResumeAllowed.title'),
    'dispute.opened': t('wallet.queue.events.disputeOpened.title'),
    'subscription.renewal_failed': t('wallet.queue.events.subscriptionRenewalFailed.title'),
    'refund.executed': t('wallet.queue.events.refundExecuted.title'),
  };

  const eventDescriptionMap: Record<string, string> = {
    'payout.queued': t('wallet.queue.events.payoutQueued.description'),
    'payout.requested': t('wallet.queue.events.payoutRequested.description'),
    'payout.processing': t('wallet.queue.events.payoutProcessing.description'),
    'payout.paused': t('wallet.queue.events.payoutPaused.description'),
    'payout.resumed': t('wallet.queue.events.payoutResumed.description'),
    'payout.completed': t('wallet.queue.events.payoutCompleted.description'),
    'payout.failed': t('wallet.queue.events.payoutFailed.description'),
    'payout.adjusted': t('wallet.queue.events.payoutAdjusted.description'),
    'debt_control.pause_required': t('wallet.queue.events.debtPauseRequired.description'),
    'debt_control.resume_allowed': t('wallet.queue.events.debtResumeAllowed.description'),
    'dispute.opened': t('wallet.queue.events.disputeOpened.description'),
    'subscription.renewal_failed': t('wallet.queue.events.subscriptionRenewalFailed.description'),
    'refund.executed': t('wallet.queue.events.refundExecuted.description'),
  };

  function formatDate(value: string) {
    const dateValue = new Date(value);
    if (Number.isNaN(dateValue.getTime())) return value;

    return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(dateValue);
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card/80 p-4 shadow-sm" aria-label={title}>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.eventId} className="rounded-lg border bg-background/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">
                    {eventTitleMap[item.eventName] ?? humanizeTechnicalCode(item.eventName)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {eventDescriptionMap[item.eventName] ?? t('wallet.queue.genericDescription')}
                  </p>
                </div>
                <Badge variant={item.state === 'action_needed' ? 'indigo' : 'outline'}>
                  {badgeLabel}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>{formatDate(item.occurredAt)}</span>
                <span>{t('wallet.queue.referenceLabel', { id: item.entityId.slice(0, 8) })}</span>
                {item.recoveryGuidance?.reasonCode ? (
                  <span>
                    {t(
                      `detail.reasonFamilies.${getOrganizerPayoutReasonFamily(item.recoveryGuidance.reasonCode)}`,
                    )}
                  </span>
                ) : null}
              </div>

              <details className="mt-3 rounded-lg border bg-muted/25 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-primary">
                  {t('wallet.queue.detailsLabel')}
                </summary>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{t('wallet.queue.technicalEventLabel')}</dt>
                    <dd className="font-mono text-xs">{item.eventName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('wallet.queue.traceLabel')}</dt>
                    <dd className="font-mono text-xs break-all">{item.traceId}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('wallet.queue.entityLabel')}</dt>
                    <dd className="font-mono text-xs break-all">
                      {item.entityType}:{item.entityId}
                    </dd>
                  </div>
                  {item.recoveryGuidance?.reasonCode ? (
                    <div>
                      <dt className="text-muted-foreground">{t('wallet.queue.rawReasonLabel')}</dt>
                      <dd className="font-mono text-xs">{item.recoveryGuidance.reasonCode}</dd>
                    </div>
                  ) : null}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OrganizerActionQueue({
  locale,
  actionNeeded,
  inProgress,
}: OrganizerActionQueueProps) {
  const t = useTranslations('pages.dashboardPayments');

  return (
    <section className="space-y-4" aria-label={t('wallet.queue.title')}>
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{t('wallet.queue.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('wallet.queue.description')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <QueueSection
          title={t('wallet.queue.actionNeeded')}
          description={t('wallet.queue.actionNeededDescription')}
          emptyMessage={t('wallet.queue.emptyActionNeeded')}
          items={actionNeeded}
          badgeLabel={t('wallet.queue.actionNeeded')}
          locale={locale}
        />
        <QueueSection
          title={t('wallet.queue.inProgress')}
          description={t('wallet.queue.inProgressDescription')}
          emptyMessage={t('wallet.queue.emptyInProgress')}
          items={inProgress}
          badgeLabel={t('wallet.queue.inProgress')}
          locale={locale}
        />
      </div>
    </section>
  );
}
