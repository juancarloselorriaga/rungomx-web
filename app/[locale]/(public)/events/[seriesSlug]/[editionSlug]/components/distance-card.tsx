import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import type { PublicDistanceInfo } from '@/lib/events/queries';
import type { getPricingScheduleForEdition } from '@/lib/events/pricing/queries';
import { Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

type EditionPricingScheduleItem = Awaited<ReturnType<typeof getPricingScheduleForEdition>>[number];

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
};

export async function DistanceCard({
  distance,
  locale,
  timezone,
  isRegistrationOpen,
  registerPath,
  sharedCapacity,
  pricingSchedule,
}: DistanceCardProps) {
  const t = await getTranslations({ locale: locale as 'es' | 'en', namespace: 'pages.events.detail' });

  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
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
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 space-y-1">
          <h3 className="font-semibold">{distance.label}</h3>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {distance.distanceValue && <span>{distanceLabel}</span>}
            {distance.terrain && (
              <span>{t(`terrain.${distance.terrain as 'road' | 'trail' | 'mixed' | 'track'}`)}</span>
            )}
            {distance.isVirtual && <span className="text-primary">{t('virtualEvent')}</span>}
          </div>
          <div className="flex flex-wrap gap-3 text-sm items-center">
            {distance.spotsRemaining !== null ? (
              isSoldOut ? (
                <span className="text-destructive flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {t('soldOut')}
                </span>
              ) : (
                <>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {t('spotsRemaining', { count: distance.spotsRemaining ?? 0 })}
                  </span>
                  {distance.capacityScope === 'shared_pool' && sharedCapacity && (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {t('capacity.sharedPoolLabel')}
                    </span>
                  )}
                </>
              )
            ) : (
              <span className="text-muted-foreground flex items-center gap-1">
                <Users className="h-4 w-4" />
                {t('unlimited')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            {distance.priceCents > 0 ? (
              <span className="text-lg font-semibold">
                {formatPrice(distance.priceCents, distance.currency)}
              </span>
            ) : (
              <span className="text-lg font-semibold text-green-600">{t('free')}</span>
            )}
            {pricingSchedule?.nextPriceIncrease && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('pricing.nextIncrease', {
                  date: formatTierDate(pricingSchedule.nextPriceIncrease.date),
                  price: formatPrice(pricingSchedule.nextPriceIncrease.priceCents, distance.currency),
                })}
              </p>
            )}
          </div>
          {isRegistrationOpen && !isSoldOut && (
            <Button size="sm" asChild>
              <Link href={registerPath}>{t('selectDistance')}</Link>
            </Button>
          )}
        </div>
      </div>

      {pricingSchedule?.tiers?.length ? (
        <details className="mt-4 rounded-md border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
            {t('pricing.showSchedule')}
          </summary>
          <div className="mt-3 space-y-2">
            {pricingSchedule.tiers.map((tier, index) => {
              const now = new Date();
              const hasStarted = !tier.startsAt || now >= tier.startsAt;
              const hasNotEnded = !tier.endsAt || now < tier.endsAt;
              const isCurrentTier = hasStarted && hasNotEnded;

              const rangeText =
                tier.startsAt && tier.endsAt
                  ? `${formatTierDate(tier.startsAt)} – ${formatTierDate(tier.endsAt)}`
                  : tier.startsAt
                    ? t('pricing.from', { date: formatTierDate(tier.startsAt) })
                    : tier.endsAt
                      ? t('pricing.until', { date: formatTierDate(tier.endsAt) })
                      : t('pricing.always');

              return (
                <div
                  key={tier.id}
                  className="flex items-start justify-between gap-4 rounded-md bg-background/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {tier.label || t('pricing.tier', { number: index + 1 })}
                      {isCurrentTier && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {t('pricing.current')}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{rangeText}</p>
                  </div>
                  <p className="text-sm font-semibold whitespace-nowrap">
                    {formatPrice(tier.priceCents, tier.currency)}
                  </p>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
