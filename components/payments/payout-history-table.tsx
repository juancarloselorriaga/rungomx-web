'use client';

import { Link } from '@/i18n/navigation';
import type { OrganizerPayoutListItem } from '@/lib/payments/organizer/payout-views';
import { Badge } from '@/components/common/badge';
import { useTranslations } from 'next-intl';

type PayoutHistoryTableProps = {
  items: OrganizerPayoutListItem[];
  locale: 'es' | 'en';
  organizationId: string;
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

function badgeVariantForStatus(status: OrganizerPayoutListItem['status']) {
  switch (status) {
    case 'completed':
      return 'green' as const;
    case 'failed':
      return 'indigo' as const;
    case 'paused':
      return 'outline' as const;
    case 'processing':
      return 'primary' as const;
    case 'requested':
    default:
      return 'default' as const;
  }
}

export function PayoutHistoryTable({ items, locale, organizationId }: PayoutHistoryTableProps) {
  const t = useTranslations('pages.dashboardPayments');

  if (items.length === 0) {
    return (
      <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
        <h2 className="text-lg font-semibold">{t('payouts.emptyTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('payouts.emptyDescription')}</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold">{t('payouts.title')}</h2>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">{t('payouts.table.requestId')}</th>
              <th className="py-2 pr-4">{t('payouts.table.status')}</th>
              <th className="py-2 pr-4">{t('payouts.table.requested')}</th>
              <th className="py-2 pr-4">{t('payouts.table.currentAmount')}</th>
              <th className="py-2">{t('payouts.table.requestedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.payoutRequestId} className="border-t align-top">
                <td className="py-3 pr-4">
                  <Link
                    href={{
                      pathname: '/dashboard/payments/payouts/[payoutRequestId]',
                      params: { payoutRequestId: item.payoutRequestId },
                      query: { organizationId },
                    }}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {item.payoutRequestId}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <Badge variant={badgeVariantForStatus(item.status)}>
                    {t(`payouts.statuses.${item.status}`)}
                  </Badge>
                </td>
                <td className="py-3 pr-4">
                  {formatMoney(item.requestedAmountMinor, item.currency, locale)}
                </td>
                <td className="py-3 pr-4">
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
