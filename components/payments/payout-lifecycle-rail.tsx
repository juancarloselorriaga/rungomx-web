'use client';

import type { OrganizerPayoutLifecycleEvent } from '@/lib/payments/organizer/payout-views';
import {
  getOrganizerPayoutReasonFamily,
  humanizeTechnicalCode,
} from '@/lib/payments/organizer/presentation';
import { useTranslations } from 'next-intl';

import { PayoutStatusBadge } from './payout-status-badge';

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
  const eventTitleMap: Record<string, string> = {
    'payout.requested': t('detail.events.requested.title'),
    'payout.processing': t('detail.events.processing.title'),
    'payout.paused': t('detail.events.paused.title'),
    'payout.resumed': t('detail.events.resumed.title'),
    'payout.completed': t('detail.events.completed.title'),
    'payout.failed': t('detail.events.failed.title'),
    'payout.adjusted': t('detail.events.adjusted.title'),
  };
  const eventDescriptionMap: Record<string, string> = {
    'payout.requested': t('detail.events.requested.description'),
    'payout.processing': t('detail.events.processing.description'),
    'payout.paused': t('detail.events.paused.description'),
    'payout.resumed': t('detail.events.resumed.description'),
    'payout.completed': t('detail.events.completed.description'),
    'payout.failed': t('detail.events.failed.description'),
    'payout.adjusted': t('detail.events.adjusted.description'),
  };

  if (events.length === 0) {
    return (
      <section className="rounded-xl border bg-card/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t('detail.stateTimeline')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('detail.noEvents')}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card/80 p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold">{t('detail.stateTimeline')}</h2>
      <p className="text-sm text-muted-foreground">{t('detail.stateTimelineDescription')}</p>

      <ol className="space-y-3">
        {events.map((event) => {
          const formattedAmount = formatAmount(event.amountMinor, locale);

          return (
            <li key={event.eventId} className="rounded-lg border bg-background/80 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <PayoutStatusBadge
                  status={event.status}
                  label={t(`payouts.statuses.${event.status}`)}
                />
                <span className="text-xs text-muted-foreground">
                  {formatDate(event.occurredAt, locale)}
                </span>
              </div>

              <div className="space-y-1">
                <p className="font-medium">
                  {eventTitleMap[event.eventName] ?? humanizeTechnicalCode(event.eventName)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {eventDescriptionMap[event.eventName] ?? t('detail.events.genericDescription')}
                </p>
              </div>

              {event.reasonCode ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t('detail.stateReason')}</span>{' '}
                  {t(`detail.reasonFamilies.${getOrganizerPayoutReasonFamily(event.reasonCode)}`)}
                </p>
              ) : null}

              {formattedAmount ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t('detail.amountSummary')}</span> {formattedAmount}
                </p>
              ) : null}

              <details className="rounded-md border bg-muted/25 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-primary">
                  {t('detail.technicalDetailsLabel')}
                </summary>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{t('detail.technicalEventLabel')}</dt>
                    <dd className="font-mono text-xs">{event.eventName}</dd>
                  </div>
                  {event.reasonCode ? (
                    <div>
                      <dt className="text-muted-foreground">{t('detail.rawReasonLabel')}</dt>
                      <dd className="font-mono text-xs">{event.reasonCode}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground">{t('detail.eventReferenceLabel')}</dt>
                    <dd className="font-mono text-xs">{event.eventId}</dd>
                  </div>
                </dl>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
