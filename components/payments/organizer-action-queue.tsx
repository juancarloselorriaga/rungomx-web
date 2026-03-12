'use client';

import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getPayoutDetailHref } from '@/lib/payments/organizer/hrefs';
import type { OrganizerWalletIssueActivityItem } from '@/lib/payments/organizer/ui';
import { humanizeTechnicalCode } from '@/lib/payments/organizer/presentation';
import { useTranslations } from 'next-intl';
import {
  PaymentsMetaLabel,
  PaymentsMetadataText,
  PaymentsMonoValue,
  PaymentsSectionDescription,
  PaymentsSectionTitle,
  PaymentsTimestamp,
} from './payments-typography';

type OrganizerActionQueueProps = {
  locale: 'es' | 'en';
  actionNeeded: OrganizerWalletIssueActivityItem[];
  inProgress: OrganizerWalletIssueActivityItem[];
  eventId?: string;
};

type QueueSectionProps = {
  title: string;
  description: string;
  emptyMessage: string;
  items: OrganizerWalletIssueActivityItem[];
  badgeLabel: string;
  locale: 'es' | 'en';
  eventId?: string;
};

function splitVisibleItems<T>(items: T[], maxVisible = 3): { visible: T[]; hidden: T[] } {
  return {
    visible: items.slice(0, maxVisible),
    hidden: items.slice(maxVisible),
  };
}

function QueueSection({
  title,
  description,
  emptyMessage,
  items,
  badgeLabel,
  locale,
  eventId,
}: QueueSectionProps) {
  const t = useTranslations('pages.dashboardPayments');
  const { visible, hidden } = splitVisibleItems(items);

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

  function getDetailHref(item: OrganizerWalletIssueActivityItem) {
    if (item.entityType !== 'payout') return null;
    return getPayoutDetailHref(item.entityId, { eventId });
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card/80 p-4 shadow-sm" aria-label={title}>
      <div className="space-y-1">
        <PaymentsSectionTitle compact className="text-base sm:text-lg">{title}</PaymentsSectionTitle>
        <PaymentsSectionDescription>{description}</PaymentsSectionDescription>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/15 px-4 py-4">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-3">
            {visible.map((item) => (
              <li key={item.eventId} className="rounded-lg border bg-background/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-base font-semibold leading-tight">
                      {eventTitleMap[item.eventName] ?? humanizeTechnicalCode(item.eventName)}
                    </p>
                    <PaymentsMetadataText>
                      {eventDescriptionMap[item.eventName] ?? t('wallet.queue.genericDescription')}
                    </PaymentsMetadataText>
                  </div>
                  <Badge variant={item.state === 'action_needed' ? 'indigo' : 'outline'}>
                    {badgeLabel}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-4">
                  <PaymentsTimestamp>{formatDate(item.occurredAt)}</PaymentsTimestamp>
                </div>

                <div className="mt-4 space-y-2">
                  {getDetailHref(item) ? (
                    <div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={getDetailHref(item)!}>{t('wallet.queue.openPayoutAction')}</Link>
                      </Button>
                    </div>
                  ) : null}

                  <details className="rounded-lg border bg-muted/25 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium text-primary">
                      {t('wallet.queue.detailsLabel')}
                    </summary>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div>
                        <PaymentsMetaLabel>{t('wallet.queue.technicalEventLabel')}</PaymentsMetaLabel>
                        <PaymentsMonoValue>{item.eventName}</PaymentsMonoValue>
                      </div>
                      <div>
                        <PaymentsMetaLabel>{t('wallet.queue.traceLabel')}</PaymentsMetaLabel>
                        <PaymentsMonoValue>{item.traceId}</PaymentsMonoValue>
                      </div>
                      <div>
                        <PaymentsMetaLabel>{t('wallet.queue.entityLabel')}</PaymentsMetaLabel>
                        <PaymentsMonoValue>
                          {item.entityType}:{item.entityId}
                        </PaymentsMonoValue>
                      </div>
                      {item.recoveryGuidance?.reasonCode ? (
                        <div>
                          <PaymentsMetaLabel>{t('wallet.queue.rawReasonLabel')}</PaymentsMetaLabel>
                          <PaymentsMonoValue>{item.recoveryGuidance.reasonCode}</PaymentsMonoValue>
                        </div>
                      ) : null}
                    </dl>
                  </details>
                </div>
              </li>
            ))}
          </ul>

          {hidden.length > 0 ? (
            <details className="rounded-lg border bg-background/70 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-primary">
                {t('wallet.queue.moreItems', { count: hidden.length })}
              </summary>
              <ul className="mt-3 space-y-3">
                {hidden.map((item) => (
                  <li key={item.eventId} className="rounded-lg border bg-background/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">
                          {eventTitleMap[item.eventName] ?? humanizeTechnicalCode(item.eventName)}
                        </p>
                        <PaymentsMetadataText>
                          {eventDescriptionMap[item.eventName] ?? t('wallet.queue.genericDescription')}
                        </PaymentsMetadataText>
                      </div>
                      <Badge variant={item.state === 'action_needed' ? 'indigo' : 'outline'}>
                        {badgeLabel}
                      </Badge>
                    </div>
                    <PaymentsTimestamp className="mt-3">{formatDate(item.occurredAt)}</PaymentsTimestamp>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function OrganizerActionQueue({
  locale,
  actionNeeded,
  inProgress,
  eventId,
}: OrganizerActionQueueProps) {
  const t = useTranslations('pages.dashboardPayments');
  const isCompletelyEmpty = actionNeeded.length === 0 && inProgress.length === 0;

  return (
    <section className="space-y-4" aria-label={t('wallet.queue.title')}>
      <div className="space-y-1">
        <PaymentsSectionTitle>{t('wallet.queue.title')}</PaymentsSectionTitle>
        <PaymentsSectionDescription>{t('wallet.queue.description')}</PaymentsSectionDescription>
      </div>

      {isCompletelyEmpty ? (
        <div className="rounded-xl border border-dashed bg-muted/15 px-5 py-5">
          <p className="font-medium">{t('wallet.queue.emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('wallet.queue.emptyDescription')}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <QueueSection
            title={t('wallet.queue.actionNeeded')}
            description={t('wallet.queue.actionNeededDescription')}
            emptyMessage={t('wallet.queue.emptyActionNeeded')}
            items={actionNeeded}
            badgeLabel={t('wallet.queue.actionNeeded')}
            locale={locale}
            eventId={eventId}
          />
          <QueueSection
            title={t('wallet.queue.inProgress')}
            description={t('wallet.queue.inProgressDescription')}
            emptyMessage={t('wallet.queue.emptyInProgress')}
            items={inProgress}
            badgeLabel={t('wallet.queue.inProgress')}
            locale={locale}
            eventId={eventId}
          />
        </div>
      )}
    </section>
  );
}
