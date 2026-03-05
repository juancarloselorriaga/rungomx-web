'use client';

import type { OrganizerPayoutLifecycleEvent } from '@/lib/payments/organizer/payout-views';
import { Badge } from '@/components/common/badge';
import { useTranslations } from 'next-intl';

type PayoutLifecycleRailProps = {
  locale: 'es' | 'en';
  events: OrganizerPayoutLifecycleEvent[];
};

function formatDate(value: Date, locale: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function formatAmount(amountMinor: number | null, locale: 'es' | 'en'): string | null {
  if (amountMinor == null) return null;
  return new Intl.NumberFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function PayoutLifecycleRail({ locale, events }: PayoutLifecycleRailProps) {
  const t = useTranslations('pages.dashboardPayments');

  if (events.length === 0) {
    return (
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t('detail.stateTimeline')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('detail.noEvents')}</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold">{t('detail.stateTimeline')}</h2>

      <ol className="space-y-3">
        {events.map((event) => {
          const formattedAmount = formatAmount(event.amountMinor, locale);

          return (
            <li key={event.eventId} className="rounded-md border bg-background p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline">{t(`payouts.statuses.${event.status}`)}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDate(event.occurredAt, locale)}
                </span>
              </div>

              <p className="text-sm font-medium">{event.eventName}</p>

              {event.reasonCode ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t('detail.stateReason')}</span> {event.reasonCode}
                </p>
              ) : null}

              {formattedAmount ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t('detail.amountSummary')}</span> {formattedAmount}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
