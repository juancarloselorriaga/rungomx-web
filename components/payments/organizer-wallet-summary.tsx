'use client';

import { deriveMaxWithdrawableMinor, type OrganizerWalletBuckets } from '@/lib/payments/organizer/ui';
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
    { id: 'available', labelKey: 'wallet.buckets.available', value: buckets.availableMinor },
    { id: 'processing', labelKey: 'wallet.buckets.processing', value: buckets.processingMinor },
    { id: 'frozen', labelKey: 'wallet.buckets.frozen', value: buckets.frozenMinor },
    { id: 'debt', labelKey: 'wallet.buckets.debt', value: buckets.debtMinor },
    {
      id: 'maxWithdrawable',
      labelKey: 'wallet.buckets.maxWithdrawableLabel',
      value: deriveMaxWithdrawableMinor(buckets),
    },
  ] as const;

  return (
    <PaymentsPanel aria-label={t('wallet.title')} className="p-5 sm:p-6">
      <div className="flex flex-col gap-2 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <PaymentsSectionTitle className="text-xl sm:text-[1.65rem]">
            {t('wallet.title')}
          </PaymentsSectionTitle>
          <PaymentsSectionDescription>{t('wallet.description')}</PaymentsSectionDescription>
        </div>
        <PaymentsTimestamp className="text-xs sm:text-sm">
          {t('wallet.asOf', { timestamp: formatAsOf(asOf, locale) })}
        </PaymentsTimestamp>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <PaymentsInsetPanel key={card.id} className="min-h-[5.75rem] space-y-2">
            <PaymentsMetricLabel>{t(card.labelKey)}</PaymentsMetricLabel>
            <PaymentsMetricValue className="break-normal text-[1rem] sm:text-[1.15rem] lg:text-[1.25rem] leading-tight tracking-[-0.01em]">
              {formatMoneyFromMinor(card.value, 'MXN', locale)}
            </PaymentsMetricValue>
          </PaymentsInsetPanel>
        ))}
      </div>
    </PaymentsPanel>
  );
}
