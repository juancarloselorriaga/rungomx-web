'use client';

import { Link } from '@/i18n/navigation';
import type { OrganizerPayoutListItem } from '@/lib/payments/organizer/payout-views';
import { shortIdentifier } from '@/lib/payments/organizer/presentation';
import { useTranslations } from 'next-intl';

import { PayoutStatusBadge } from './payout-status-badge';

type PayoutHistoryTableProps = {
  items: OrganizerPayoutListItem[];
  locale: 'es' | 'en';
  title?: string;
  description?: string;
};

function formatMoney(minor: number, currency: string, locale: 'es' | 'en'): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

function formatDate(value: Date, locale: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function PayoutHistoryTable({
  items,
  locale,
  title,
  description,
}: PayoutHistoryTableProps) {
  const t = useTranslations('pages.dashboardPayments');

  if (items.length === 0) {
    return (
      <section className="rounded-xl border bg-card/80 p-6 shadow-sm space-y-2">
        {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
        <p className="text-sm text-muted-foreground">
          {description ?? t('payouts.emptyDescription')}
        </p>
        <div className="rounded-lg border border-dashed bg-background/70 p-6 text-sm text-muted-foreground">
          {t('payouts.emptyTitle')}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card/80 p-6 shadow-sm space-y-4">
      {title || description ? (
        <div className="space-y-1">
          {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">{t('payouts.table.requestId')}</th>
              <th className="py-2 pr-4">{t('payouts.table.status')}</th>
              <th className="py-2 pr-4 text-right">{t('payouts.table.requested')}</th>
              <th className="py-2 pr-4 text-right">{t('payouts.table.currentAmount')}</th>
              <th className="py-2">{t('payouts.table.requestedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.payoutRequestId} className="border-t align-top transition hover:bg-muted/15">
                <td className="py-3 pr-4">
                  <Link
                    href={{
                      pathname: '/dashboard/payments/payouts/[payoutRequestId]',
                      params: { payoutRequestId: item.payoutRequestId },
                    }}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {t('payouts.table.requestLabel', { id: shortIdentifier(item.payoutRequestId) })}
                  </Link>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{item.payoutRequestId}</p>
                </td>
                <td className="py-3 pr-4">
                  <PayoutStatusBadge
                    status={item.status}
                    label={t(`payouts.statuses.${item.status}`)}
                  />
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">
                  {formatMoney(item.requestedAmountMinor, item.currency, locale)}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">
                  {formatMoney(item.currentRequestedAmountMinor, item.currency, locale)}
                </td>
                <td className="py-3">{formatDate(item.requestedAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
