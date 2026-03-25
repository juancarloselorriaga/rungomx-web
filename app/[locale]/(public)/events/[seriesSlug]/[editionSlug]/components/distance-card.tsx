import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import type { PublicDistanceInfo } from '@/lib/events/queries';
import type { getPricingScheduleForEdition } from '@/lib/events/pricing/queries';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

type EditionPricingScheduleItem = Awaited<ReturnType<typeof getPricingScheduleForEdition>>[number];

type GroupDiscountRule = {
  minParticipants: number;
  percentOff: number;
};

type DistanceCardProps = {
  distance: PublicDistanceInfo;
  locale: string;
  timezone: string;
  isRegistrationOpen: boolean;
  registerPath: {
    pathname: '/events/[seriesSlug]/[editionSlug]/register';
    params: { seriesSlug: string; editionSlug: string };
    query?: { distanceId: string };
  };
  sharedCapacity: number | null;
  pricingSchedule: EditionPricingScheduleItem | null;
  bestGroupDiscount?: GroupDiscountRule;
};

export async function DistanceCard({
  distance,
  locale,
  timezone,
  isRegistrationOpen,
  registerPath,
  sharedCapacity,
  pricingSchedule,
  bestGroupDiscount,
}: DistanceCardProps) {
  const t = await getTranslations({ locale: locale as 'es' | 'en', namespace: 'pages.events.detail' });

  const formatPrice = (cents: number, currency: string) => {
    return formatMoneyFromMinor(cents, currency, locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const formatTierDate = (value: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(value);

  const distanceLabel = distance.distanceValue
    ? `${distance.distanceValue} ${distance.distanceUnit}`
    : distance.label;

  const isSoldOut = distance.spotsRemaining !== null && distance.spotsRemaining <= 0;

  return (
    <div className="rounded-[1.45rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_80%,var(--background-surface)_20%)] p-5 md:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-display text-[clamp(1.45rem,2.7vw,1.95rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
              {distance.label}
            </h3>
            {distance.isVirtual ? <Badge variant="blue" size="sm">{t('virtualEvent')}</Badge> : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm leading-7 text-muted-foreground">
            {distance.distanceValue ? <span>{distanceLabel}</span> : null}
            {distance.terrain ? (
              <span>{t(`terrain.${distance.terrain as 'road' | 'trail' | 'mixed' | 'track'}`)}</span>
            ) : null}
            {distance.spotsRemaining !== null ? (
              isSoldOut ? (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <Users className="h-4 w-4" />
                  {t('soldOut')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {t('spotsRemaining', { count: distance.spotsRemaining ?? 0 })}
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1">
                <Users className="h-4 w-4" />
                {t('unlimited')}
              </span>
            )}
            {distance.capacityScope === 'shared_pool' && sharedCapacity ? (
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                {t('capacity.sharedPoolLabel')}
              </span>
            ) : null}
          </div>

          {bestGroupDiscount && distance.priceCents > 0 ? (
            <p className="mt-4 text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[var(--brand-green-dark)]">
              {t('groupDiscount.savePercent', { percent: bestGroupDiscount.percentOff })}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-3 lg:min-w-[12rem] lg:items-end">
          <div className="text-left lg:text-right">
            <p className="font-display text-[clamp(1.65rem,2.6vw,2.25rem)] font-medium leading-[0.95] tracking-[-0.03em] text-foreground">
              {distance.priceCents > 0
                ? formatPrice(distance.priceCents, distance.currency)
                : t('free')}
            </p>
            {pricingSchedule?.nextPriceIncrease ? (
              <p className="mt-2 max-w-[16rem] text-xs leading-6 text-muted-foreground lg:ml-auto">
                {t('pricing.nextIncrease', {
                  date: formatTierDate(pricingSchedule.nextPriceIncrease.date),
                  price: formatPrice(pricingSchedule.nextPriceIncrease.priceCents, distance.currency),
                })}
              </p>
            ) : null}
          </div>

          {isRegistrationOpen && !isSoldOut ? (
            <Button size="sm" asChild>
              <Link href={registerPath}>{t('selectDistance')}</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {pricingSchedule?.tiers?.length ? (
        <details className="mt-5 border-t border-border/70 pt-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            {t('pricing.showSchedule')}
          </summary>
          <div className="mt-4 space-y-3">
            {pricingSchedule.tiers.map((tier, index) => {
              const now = new Date();
              const hasStarted = !tier.startsAt || now >= tier.startsAt;
              const hasNotEnded = !tier.endsAt || now < tier.endsAt;
              const isCurrentTier = hasStarted && hasNotEnded;

              const rangeText =
                tier.startsAt && tier.endsAt
                  ? `${formatTierDate(tier.startsAt)} - ${formatTierDate(tier.endsAt)}`
                  : tier.startsAt
                    ? t('pricing.from', { date: formatTierDate(tier.startsAt) })
                    : tier.endsAt
                      ? t('pricing.until', { date: formatTierDate(tier.endsAt) })
                      : t('pricing.always');

              return (
                <div
                  key={tier.id}
                  className="rounded-[1.15rem] border border-border/45 bg-background/80 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {tier.label || t('pricing.tier', { number: index + 1 })}
                        </p>
                        {isCurrentTier ? (
                          <Badge variant="primary" size="sm">
                            {t('pricing.current')}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">{rangeText}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-foreground">
                      {formatPrice(tier.priceCents, tier.currency)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
