'use client';

import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getPayoutDetailHref } from '@/lib/payments/organizer/hrefs';
import type { OrganizerWalletIssueActivityItem } from '@/lib/payments/organizer/ui';
import { getOrganizerQueueEventCopy } from '@/lib/payments/organizer/presentation';
import { useTranslations } from 'next-intl';
import {
  PaymentsCountPill,
  PaymentsMetaLabel,
  PaymentsMetadataText,
  PaymentsMonoValue,
  PaymentsSectionDescription,
  PaymentsSectionTitle,
  PaymentsTimestamp,
} from './payments-typography';
import { PaymentsPanel } from './payments-surfaces';

type OrganizerActionQueueProps = {
  locale: 'es' | 'en';
  actionNeeded: OrganizerWalletIssueActivityItem[];
  inProgress: OrganizerWalletIssueActivityItem[];
  eventId?: string;
};

type QueueSectionProps = {
  testId: string;
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
  testId,
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
    <PaymentsPanel
      className="space-y-3"
      aria-label={title}
      data-testid={testId}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <PaymentsSectionTitle compact className="text-base sm:text-lg">{title}</PaymentsSectionTitle>
          <PaymentsCountPill>{items.length}</PaymentsCountPill>
        </div>
        <PaymentsSectionDescription>{description}</PaymentsSectionDescription>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/15 px-4 py-4">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-3">
            {visible.map((item) => {
              const eventCopy = getOrganizerQueueEventCopy(item.eventName);

              return (
                <li key={item.eventId} className="rounded-lg border bg-background/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-base font-semibold leading-tight">{t(eventCopy.titleKey)}</p>
                      <PaymentsMetadataText>{t(eventCopy.descriptionKey)}</PaymentsMetadataText>
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
                          <PaymentsMetaLabel>{t('wallet.queue.entityLabel')}</PaymentsMetaLabel>
                          <PaymentsMonoValue>{item.entityId}</PaymentsMonoValue>
                        </div>
                      </dl>
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>

          {hidden.length > 0 ? (
            <details className="rounded-lg border bg-background/70 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-primary">
                {t('wallet.queue.moreItems', { count: hidden.length })}
              </summary>
              <ul className="mt-3 space-y-3">
                {hidden.map((item) => {
                  const eventCopy = getOrganizerQueueEventCopy(item.eventName);

                  return (
                    <li key={item.eventId} className="rounded-lg border bg-background/80 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{t(eventCopy.titleKey)}</p>
                          <PaymentsMetadataText>{t(eventCopy.descriptionKey)}</PaymentsMetadataText>
                        </div>
                        <Badge variant={item.state === 'action_needed' ? 'indigo' : 'outline'}>
                          {badgeLabel}
                        </Badge>
                      </div>
                      <PaymentsTimestamp className="mt-3">{formatDate(item.occurredAt)}</PaymentsTimestamp>
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </PaymentsPanel>
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
    <section
      className="space-y-4"
      aria-label={t('wallet.queue.title')}
      data-testid="payments-action-queue"
    >
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
            testId="payments-action-needed-section"
            title={t('wallet.queue.actionNeeded')}
            description={t('wallet.queue.actionNeededDescription')}
            emptyMessage={t('wallet.queue.emptyActionNeeded')}
            items={actionNeeded}
            badgeLabel={t('wallet.queue.actionNeeded')}
            locale={locale}
            eventId={eventId}
          />
          <QueueSection
            testId="payments-in-progress-section"
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
