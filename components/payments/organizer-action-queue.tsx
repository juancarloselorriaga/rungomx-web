'use client';

import { Badge } from '@/components/common/badge';
import type { OrganizerWalletIssueActivityItem } from '@/lib/payments/organizer/ui';
import { useTranslations } from 'next-intl';

type OrganizerActionQueueProps = {
  actionNeeded: OrganizerWalletIssueActivityItem[];
  inProgress: OrganizerWalletIssueActivityItem[];
};

type QueueSectionProps = {
  title: string;
  description: string;
  emptyMessage: string;
  items: OrganizerWalletIssueActivityItem[];
  badgeLabel: string;
  whatChangedLabel: string;
  whyItMattersLabel: string;
  whatYouCanDoNowLabel: string;
  guidanceLabel: string;
};

function QueueSection({
  title,
  description,
  emptyMessage,
  items,
  badgeLabel,
  whatChangedLabel,
  whyItMattersLabel,
  whatYouCanDoNowLabel,
  guidanceLabel,
}: QueueSectionProps) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm" aria-label={title}>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.eventId} className="rounded-md border bg-background px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.eventName}
                </p>
                <Badge variant={item.state === 'action_needed' ? 'indigo' : 'outline'}>
                  {badgeLabel}
                </Badge>
              </div>

              <div className="mt-2 space-y-2 text-sm">
                <p>
                  <span className="font-medium">{whatChangedLabel}</span> {item.eventName}
                </p>
                <p>
                  <span className="font-medium">{whyItMattersLabel}</span> {item.stateDescription}
                </p>
                <p>
                  <span className="font-medium">{whatYouCanDoNowLabel}</span> {guidanceLabel}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OrganizerActionQueue({ actionNeeded, inProgress }: OrganizerActionQueueProps) {
  const t = useTranslations('pages.dashboardPayments');

  return (
    <section className="space-y-4" aria-label={t('wallet.queue.title')}>
      <h2 className="text-lg font-semibold">{t('wallet.queue.title')}</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <QueueSection
          title={t('wallet.queue.actionNeeded')}
          description={t('wallet.queue.actionNeededDescription')}
          emptyMessage={t('wallet.queue.emptyActionNeeded')}
          items={actionNeeded}
          badgeLabel={t('wallet.queue.actionNeeded')}
          whatChangedLabel={t('wallet.queue.whatChanged')}
          whyItMattersLabel={t('wallet.queue.whyItMatters')}
          whatYouCanDoNowLabel={t('wallet.queue.whatYouCanDoNow')}
          guidanceLabel={t('wallet.queue.actionNeededGuidance')}
        />
        <QueueSection
          title={t('wallet.queue.inProgress')}
          description={t('wallet.queue.inProgressDescription')}
          emptyMessage={t('wallet.queue.emptyInProgress')}
          items={inProgress}
          badgeLabel={t('wallet.queue.inProgress')}
          whatChangedLabel={t('wallet.queue.whatChanged')}
          whyItMattersLabel={t('wallet.queue.whyItMatters')}
          whatYouCanDoNowLabel={t('wallet.queue.whatYouCanDoNow')}
          guidanceLabel={t('wallet.queue.inProgressGuidance')}
        />
      </div>
    </section>
  );
}
