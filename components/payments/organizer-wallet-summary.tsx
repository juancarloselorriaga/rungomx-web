'use client';

import type { OrganizerWalletBuckets } from '@/lib/payments/organizer/ui';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { useTranslations } from 'next-intl';
import {
  PaymentsMetricLabel,
  PaymentsMetricValue,
  PaymentsSectionDescription,
  PaymentsSectionTitle,
  PaymentsTimestamp,
} from './payments-typography';
import { PaymentsInsetPanel, PaymentsPanel } from './payments-surfaces';

type OrganizerWalletSummaryProps = {
  asOf: string;
  buckets: OrganizerWalletBuckets;
  locale: 'es' | 'en';
};

function formatAsOf(value: string, locale: 'es' | 'en'): string {
  const asOfDate = new Date(value);
  if (Number.isNaN(asOfDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(asOfDate);
}

export function OrganizerWalletSummary({ asOf, buckets, locale }: OrganizerWalletSummaryProps) {
  const t = useTranslations('pages.dashboardPayments');

  const cards = [
    { key: 'available', value: buckets.availableMinor },
    { key: 'processing', value: buckets.processingMinor },
    { key: 'frozen', value: buckets.frozenMinor },
    { key: 'debt', value: buckets.debtMinor },
  ] as const;

  return (
    <PaymentsPanel aria-label={t('wallet.title')}>
      <div className="flex flex-col gap-2 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <PaymentsSectionTitle className="text-xl sm:text-[1.65rem]">{t('wallet.title')}</PaymentsSectionTitle>
          <PaymentsSectionDescription>{t('wallet.description')}</PaymentsSectionDescription>
        </div>
        <PaymentsTimestamp className="text-xs sm:text-sm">
          {t('wallet.asOf', { timestamp: formatAsOf(asOf, locale) })}
        </PaymentsTimestamp>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((card) => (
          <PaymentsInsetPanel key={card.key} className="space-y-2">
            <PaymentsMetricLabel>{t(`wallet.buckets.${card.key}`)}</PaymentsMetricLabel>
            <PaymentsMetricValue className="text-xl sm:text-[1.75rem]">
              {formatMoneyFromMinor(card.value, 'MXN', locale)}
            </PaymentsMetricValue>
          </PaymentsInsetPanel>
        ))}
      </div>
    </PaymentsPanel>
  );
}
