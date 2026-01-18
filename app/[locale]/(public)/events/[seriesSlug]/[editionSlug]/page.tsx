import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import {
  getPublicEventBySlug,
  getPublicOtherEditionsForSeries,
  type PublicDistanceInfo,
} from '@/lib/events/queries';
import { getPricingScheduleForEdition } from '@/lib/events/pricing/queries';
import { getPublicWebsiteContent, hasWebsiteContent, resolveWebsiteMediaUrls } from '@/lib/events/website/queries';
import type { SportType } from '@/lib/events/constants';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { generateAlternateMetadata } from '@/utils/seo';
import { cn } from '@/lib/utils';
import { ArrowLeft, Calendar, ExternalLink, Info, MapPin, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { EventTabs, type TabId } from './event-tabs';
import { WebsiteContentRenderer } from './website-content-renderer';

type EditionPricingScheduleItem = Awaited<ReturnType<typeof getPricingScheduleForEdition>>[number];

type EventDetailPageProps = LocalePageProps & {
  params: Promise<{ locale: string; seriesSlug: string; editionSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { locale, seriesSlug, editionSlug } = await params;
  const event = await getPublicEventBySlug(seriesSlug, editionSlug);

  if (!event) {
    return {
      title: 'Event Not Found | RunGoMX',
      robots: { index: false, follow: false },
    };
  }

  const location = event.locationDisplay || [event.city, event.state].filter(Boolean).join(', ');
  const { canonical, languages, openGraphLocale } = await generateAlternateMetadata(
    locale,
    '/events/[seriesSlug]/[editionSlug]',
    { seriesSlug, editionSlug },
  );

  return {
    title: `${event.seriesName} ${event.editionLabel} | RunGoMX`,
    description: event.description || `${event.seriesName} - ${location}`,
    alternates: { canonical, languages },
    openGraph: {
      title: `${event.seriesName} ${event.editionLabel}`,
      description: event.description || `${event.seriesName} - ${location}`,
      type: 'website',
      url: canonical,
      locale: openGraphLocale,
    },
    ...(event.visibility === 'unlisted'
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

export default async function EventDetailPage({ params, searchParams }: EventDetailPageProps) {
  const { locale, seriesSlug, editionSlug } = await params;
  const { tab } = await searchParams;
  await configPageLocale(params, { pathname: '/events/[seriesSlug]/[editionSlug]' });

  const t = await getTranslations({ locale, namespace: 'pages.events' });
  const event = await getPublicEventBySlug(seriesSlug, editionSlug);

  if (!event) {
    notFound();
  }

  // Determine which tab to show
  const hasWebsite = await hasWebsiteContent(event.id);
  const validTabs: TabId[] = ['overview', 'distances', 'faq', 'policies'];
  if (hasWebsite) {
    validTabs.push('website');
  }
  const currentTab: TabId = (tab && validTabs.includes(tab as TabId) ? tab : 'overview') as TabId;

  // Load website content if on website tab
  const websiteContent = currentTab === 'website' ? await getPublicWebsiteContent(event.id, locale) : null;
  const mediaUrls = websiteContent ? await resolveWebsiteMediaUrls(websiteContent) : undefined;

  const pricingSchedule =
    currentTab === 'distances' ? await getPricingScheduleForEdition(event.id) : null;
  const pricingScheduleByDistanceId = pricingSchedule
    ? new Map(pricingSchedule.map((item) => [item.distanceId, item]))
    : null;

  const otherEditions = await getPublicOtherEditionsForSeries(event.seriesId, event.id);

  // Format dates
  const eventDate = event.startsAt
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: event.timezone,
      }).format(new Date(event.startsAt))
    : null;

  const formatRegistrationDate = (value: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: event.timezone,
    }).format(new Date(value));

  const registrationOpensAt = event.registrationOpensAt
    ? formatRegistrationDate(event.registrationOpensAt)
    : null;
  const registrationClosesAt = event.registrationClosesAt
    ? formatRegistrationDate(event.registrationClosesAt)
    : null;
  const hasRegistrationDetails = Boolean(
    registrationOpensAt || registrationClosesAt || event.isRegistrationPaused,
  );
  const policyCopy = {
    refund: {
      title: t('detail.policies.refund.title'),
      deadline: (date: string) => t('detail.policies.refund.deadline', { date }),
    },
    transfer: {
      title: t('detail.policies.transfer.title'),
      deadline: (date: string) => t('detail.policies.transfer.deadline', { date }),
    },
    deferral: {
      title: t('detail.policies.deferral.title'),
      deadline: (date: string) => t('detail.policies.deferral.deadline', { date }),
    },
  } as const;
  const policyConfig = event.policyConfig;
  const policySections: Array<{
    key: keyof typeof policyCopy;
    enabled: boolean;
    text: string | null;
    deadline: Date | null;
  }> = policyConfig
    ? [
        {
          key: 'refund',
          enabled: policyConfig.refundsAllowed,
          text: policyConfig.refundPolicyText,
          deadline: policyConfig.refundDeadline,
        },
        {
          key: 'transfer',
          enabled: policyConfig.transfersAllowed,
          text: policyConfig.transferPolicyText,
          deadline: policyConfig.transferDeadline,
        },
        {
          key: 'deferral',
          enabled: policyConfig.deferralsAllowed,
          text: policyConfig.deferralPolicyText,
          deadline: policyConfig.deferralDeadline,
        },
      ]
    : [];

  const location = event.locationDisplay || [event.city, event.state].filter(Boolean).join(', ');

  // Find minimum price
  const minPrice = event.distances.reduce(
    (min, d) => (d.priceCents < min ? d.priceCents : min),
    event.distances[0]?.priceCents ?? 0,
  );

  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  // Calculate if event uses shared capacity pool
  const hasSharedPool =
    event.sharedCapacity !== null &&
    event.distances.some((d) => d.capacityScope === 'shared_pool');

  return (
    <div className="min-h-screen">
      {/* Hero section */}
      <div className="relative bg-muted rounded-2xl">
        <div className="container mx-auto px-4 py-12 max-w-7xl">
          <Link
            href="/events"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('title')}
          </Link>

          {event.heroImageUrl && (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border bg-muted mb-6">
              <Image
                src={event.heroImageUrl}
                alt={`${event.seriesName} ${event.editionLabel}`}
                fill
                className="object-cover"
                priority
                sizes="100vw"
              />
            </div>
          )}

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="space-y-4">
              {/* Sport type badge */}
              <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                {t(`sportTypes.${event.sportType as SportType}`)}
              </span>

              <h1 className="text-4xl font-bold tracking-tight">
                {event.seriesName}
              </h1>
              <p className="text-xl text-muted-foreground">{event.editionLabel}</p>

              {/* Key info */}
              <div className="flex flex-wrap gap-4 text-sm">
                {eventDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>{eventDate}</span>
                  </div>
                )}
                {location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span>{location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Registration CTA */}
            <div className="flex flex-col items-start lg:items-end gap-2">
              <span
                className={cn(
                  'text-sm font-medium px-3 py-1.5 rounded-full',
                  event.isRegistrationOpen
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {event.isRegistrationOpen
                  ? t('detail.registrationOpen')
                  : t('detail.registrationClosed')}
              </span>
              {minPrice > 0 ? (
                <span className="text-lg font-semibold">
                  {t('detail.fromPrice', { price: formatPrice(minPrice, event.distances[0]?.currency ?? 'MXN') })}
                </span>
              ) : (
                <span className="text-lg font-semibold text-green-600">{t('detail.free')}</span>
              )}
              {event.isRegistrationOpen && (
                <Button size="lg" asChild className="mt-2">
                  <Link
                    href={{
                      pathname: '/events/[seriesSlug]/[editionSlug]/register',
                      params: { seriesSlug, editionSlug },
                    }}
                  >
                    {t('detail.registerNow')}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <EventTabs
        seriesSlug={seriesSlug}
        editionSlug={editionSlug}
        hasWebsiteContent={hasWebsite}
        currentTab={currentTab}
      />

      {/* Content */}
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-12">
            {/* Overview Tab */}
            {currentTab === 'overview' && event.description && (
              <section>
                <h2 className="text-2xl font-bold mb-4">{t('detail.about')}</h2>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="whitespace-pre-wrap">{event.description}</p>
                </div>
              </section>
            )}

            {/* Distances Tab */}
            {currentTab === 'distances' && event.distances.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6">{t('detail.distances')}</h2>

                {/* Shared capacity banner */}
                {hasSharedPool && event.sharedCapacity && (
                  <div className="rounded-lg border bg-muted/40 p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">
                          {t('detail.capacity.sharedPoolBanner', { total: event.sharedCapacity })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid gap-4">
                  {event.distances.map((distance) => (
                    <DistanceCard
                      key={distance.id}
                      distance={distance}
                      locale={locale}
                      timezone={event.timezone}
                      isRegistrationOpen={event.isRegistrationOpen}
                      registerPath={{
                        pathname: '/events/[seriesSlug]/[editionSlug]/register',
                        params: { seriesSlug, editionSlug },
                        query: { distanceId: distance.id },
                      }}
                      sharedCapacity={event.sharedCapacity}
                      pricingSchedule={pricingScheduleByDistanceId?.get(distance.id) ?? null}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* FAQ Tab */}
            {currentTab === 'faq' && event.faqItems.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6">{t('detail.faq')}</h2>
                <div className="space-y-4">
                  {event.faqItems.map((item) => (
                    <details
                      key={item.id}
                      className="group rounded-lg border bg-card p-4"
                    >
                      <summary className="font-medium cursor-pointer list-none flex items-center justify-between">
                        {item.question}
                        <span className="ml-2 text-muted-foreground transition-transform group-open:rotate-180">
                          ▼
                        </span>
                      </summary>
                      <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">
                        {item.answer}
                      </p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {/* Policies Tab */}
            {currentTab === 'policies' && policySections.some((policy) => policy.enabled || policy.text || policy.deadline) && (
              <section>
                <h2 className="text-2xl font-bold mb-6">{t('detail.policies.title')}</h2>
                <div className="grid gap-4">
                  {policySections.map((policy) => {
                    if (!policy.enabled && !policy.text && !policy.deadline) {
                      return null;
                    }

                    const deadlineText = policy.deadline
                      ? new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: event.timezone,
                        }).format(new Date(policy.deadline))
                      : null;

                    return (
                      <div key={policy.key} className="rounded-lg border bg-card p-4">
                        <h3 className="font-semibold">{policyCopy[policy.key].title}</h3>
                        {policy.text && (
                          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                            {policy.text}
                          </p>
                        )}
                        {deadlineText && (
                          <p className="text-xs text-muted-foreground mt-3">
                            {policyCopy[policy.key].deadline(deadlineText)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Website Tab */}
            {currentTab === 'website' && websiteContent && (
              <section>
                <WebsiteContentRenderer
                  blocks={websiteContent}
                  mediaUrls={mediaUrls}
                  labels={{
                    documents: t('detail.website.documents'),
                    photos: t('detail.website.photos'),
                    terrain: t('detail.website.terrain'),
                    download: t('detail.website.download'),
                  }}
                />
              </section>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Event details card */}
            <div className="rounded-lg border bg-card p-6 space-y-4 sticky top-24">
              <h3 className="font-semibold">{t('detail.eventDate')}</h3>
              {eventDate ? (
                <p className="text-sm text-muted-foreground">{eventDate}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">TBA</p>
              )}

              {location && (
                <>
                  <h3 className="font-semibold pt-2">{t('detail.location')}</h3>
                  <p className="text-sm text-muted-foreground">{location}</p>
                  {event.address && (
                    <p className="text-sm text-muted-foreground">{event.address}</p>
                  )}
                  {event.latitude && event.longitude && (
                    <a
                      href={`https://www.google.com/maps?q=${event.latitude},${event.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {t('detail.viewMap')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </>
              )}

              <h3 className="font-semibold pt-2">{t('detail.organizer')}</h3>
              <p className="text-sm text-muted-foreground">{event.organizationName}</p>

              {event.externalUrl && (
                <a
                  href={event.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  Official website
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {hasRegistrationDetails && (
                <div className="border-t pt-4 space-y-2">
                  <h3 className="font-semibold">{t('detail.registrationDetails')}</h3>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {registrationOpensAt && (
                      <p>{t('detail.registrationOpens', { date: registrationOpensAt })}</p>
                    )}
                    {registrationClosesAt && (
                      <p>{t('detail.registrationCloses', { date: registrationClosesAt })}</p>
                    )}
                    {event.isRegistrationPaused && (
                      <p className="text-destructive">{t('detail.registrationPaused')}</p>
                    )}
                  </div>
                </div>
              )}

              {otherEditions.length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <h3 className="font-semibold">{t('detail.otherEditions.title')}</h3>
                  <ul className="space-y-2">
                    {otherEditions.map((edition) => {
                      const editionDate = edition.startsAt
                        ? new Intl.DateTimeFormat(locale, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            timeZone: edition.timezone,
                          }).format(new Date(edition.startsAt))
                        : 'TBA';
                      const editionLocation =
                        edition.locationDisplay ||
                        [edition.city, edition.state].filter(Boolean).join(', ');

                      return (
                        <li key={edition.id}>
                          <Link
                            href={{
                              pathname: '/events/[seriesSlug]/[editionSlug]',
                              params: { seriesSlug, editionSlug: edition.slug },
                            }}
                            className="group block rounded-md -mx-2 px-2 py-1.5 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{edition.editionLabel}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {[editionDate, editionLocation].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  'text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap',
                                  edition.isRegistrationOpen
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-muted text-muted-foreground',
                                )}
                              >
                                {edition.isRegistrationOpen
                                  ? t('detail.registrationOpen')
                                  : t('detail.registrationClosed')}
                              </span>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Distance card component
async function DistanceCard({
  distance,
  locale,
  timezone,
  isRegistrationOpen,
  registerPath,
  sharedCapacity,
  pricingSchedule,
}: {
  distance: PublicDistanceInfo;
  locale: string;
  timezone: string;
  isRegistrationOpen: boolean;
  registerPath: { pathname: '/events/[seriesSlug]/[editionSlug]/register'; params: { seriesSlug: string; editionSlug: string }; query?: { distanceId: string } };
  sharedCapacity: number | null;
  pricingSchedule: EditionPricingScheduleItem | null;
}) {
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
