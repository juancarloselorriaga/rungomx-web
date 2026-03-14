'use client';

import type { OrganizerPayoutLifecycleEvent } from '@/lib/payments/organizer/payout-views';
import {
  getOrganizerPayoutReasonFamily,
  getOrganizerPayoutLifecycleEventCopy,
} from '@/lib/payments/organizer/presentation';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { useTranslations } from 'next-intl';

import { PayoutStatusBadge } from './payout-status-badge';
import { PaymentsCountPill } from './payments-typography';
import { PaymentsPanel } from './payments-surfaces';

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
  return formatMoneyFromMinor(amountMinor, 'MXN', locale);
}

function getVisibleReasonFamily(reasonCode: string | null) {
  if (!reasonCode?.trim()) return null;
  return getOrganizerPayoutReasonFamily(reasonCode);
}

export function PayoutLifecycleRail({ locale, events }: PayoutLifecycleRailProps) {
  const t = useTranslations('pages.dashboardPayments');

  if (events.length === 0) {
    return (
      <PaymentsPanel className="space-y-2">
        <h2 className="text-lg font-semibold">{t('detail.stateTimeline')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('detail.noEvents')}</p>
      </PaymentsPanel>
    );
  }

  return (
    <PaymentsPanel className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{t('detail.stateTimeline')}</h2>
          <PaymentsCountPill>{events.length}</PaymentsCountPill>
        </div>
        <p className="text-sm text-muted-foreground">{t('detail.stateTimelineDescription')}</p>
      </div>

      <ol className="space-y-4">
        {events.map((event) => {
          const formattedAmount = formatAmount(event.amountMinor, locale);
          const visibleReasonFamily = getVisibleReasonFamily(event.reasonCode);
          const eventCopy = getOrganizerPayoutLifecycleEventCopy(event.eventName);

          return (
            <li key={event.eventId} className="relative rounded-xl border bg-background/85 p-4 shadow-sm sm:p-5">
              <div className="absolute left-4 top-5 h-[calc(100%-2.75rem)] w-px bg-border/70 sm:left-5 sm:top-6 sm:h-[calc(100%-3rem)]" aria-hidden="true" />
              <div className="relative pl-7 sm:pl-8">
                <span
                  className="absolute left-[-0.5rem] top-1 inline-flex size-4 rounded-full border-2 border-background bg-primary/80 sm:left-[-0.55rem]"
                  aria-hidden="true"
                />

                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <PayoutStatusBadge
                          status={event.status}
                          label={t(`payouts.statuses.${event.status}`)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {formatDate(event.occurredAt, locale)}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-base font-semibold leading-tight sm:text-lg">
                          {t(eventCopy.titleKey)}
                        </p>
                        <p className="text-sm text-muted-foreground">{t(eventCopy.descriptionKey)}</p>
                      </div>
                    </div>
                  </div>

                  {visibleReasonFamily || formattedAmount ? (
                    <div className="flex flex-wrap gap-2">
                      {visibleReasonFamily ? (
                        <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                          <span className="font-medium">{t('detail.stateReason')}:</span>{' '}
                          {t(`detail.reasonFamilies.${visibleReasonFamily}`)}
                        </span>
                      ) : null}

                      {formattedAmount ? (
                        <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                          <span className="font-medium">{t('detail.amountSummary')}:</span>{' '}
                          {formattedAmount}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <details className="mt-4 rounded-md border bg-muted/20 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-primary">
                  {t('detail.technicalDetailsLabel')}
                </summary>
                <dl className="mt-3 space-y-2 text-sm">
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
    </PaymentsPanel>
  );
}
