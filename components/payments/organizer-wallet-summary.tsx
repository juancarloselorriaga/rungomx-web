'use client';

import type { OrganizerWalletBuckets } from '@/lib/payments/organizer/ui';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { useTranslations } from 'next-intl';

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
    <section className="rounded-xl border bg-card/80 p-5 shadow-sm" aria-label={t('wallet.title')}>
      <div className="flex flex-col gap-2 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">{t('wallet.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('wallet.description')}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('wallet.asOf', { timestamp: formatAsOf(asOf, locale) })}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.key} className="rounded-lg border bg-background/80 p-4">
            <p className="text-sm text-muted-foreground">{t(`wallet.buckets.${card.key}`)}</p>
            <p className="mt-2 text-2xl font-semibold">
              {formatMoneyFromMinor(card.value, 'MXN', locale)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
