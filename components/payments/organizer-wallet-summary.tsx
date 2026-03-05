'use client';

import type { OrganizerWalletBuckets } from '@/lib/payments/organizer/ui';
import { useTranslations } from 'next-intl';

type OrganizerWalletSummaryProps = {
  asOf: string;
  buckets: OrganizerWalletBuckets;
  locale: 'es' | 'en';
};

function formatMoney(minor: number, locale: 'es' | 'en'): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

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
    <section className="space-y-4" aria-label={t('home.title')}>
      <p className="text-sm text-muted-foreground">
        {t('wallet.asOf', { timestamp: formatAsOf(asOf, locale) })}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <article key={card.key} className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{t(`wallet.buckets.${card.key}`)}</p>
            <p className="mt-2 text-2xl font-semibold">{formatMoney(card.value, locale)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
