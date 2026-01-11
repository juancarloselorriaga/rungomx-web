import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getPublicEventBySlug, type PublicDistanceInfo } from '@/lib/events/queries';
import type { SportType } from '@/lib/events/constants';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { cn } from '@/lib/utils';
import { ArrowLeft, Calendar, ExternalLink, MapPin, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

type EventDetailPageProps = LocalePageProps & {
  params: Promise<{ locale: string; seriesSlug: string; editionSlug: string }>;
};

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { seriesSlug, editionSlug } = await params;
  const event = await getPublicEventBySlug(seriesSlug, editionSlug);

  if (!event) {
    return {
      title: 'Event Not Found | RunGoMX',
      robots: { index: false, follow: false },
    };
  }

  const location = event.locationDisplay || [event.city, event.state].filter(Boolean).join(', ');

  return {
    title: `${event.seriesName} ${event.editionLabel} | RunGoMX`,
    description: event.description || `${event.seriesName} - ${location}`,
    openGraph: {
      title: `${event.seriesName} ${event.editionLabel}`,
      description: event.description || `${event.seriesName} - ${location}`,
      type: 'website',
    },
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { locale, seriesSlug, editionSlug } = await params;
  await configPageLocale(params, { pathname: '/events/[seriesSlug]/[editionSlug]' });

  const t = await getTranslations({ locale, namespace: 'pages.events' });
  const event = await getPublicEventBySlug(seriesSlug, editionSlug);

  if (!event) {
    notFound();
  }

  // Format dates
  const eventDate = event.startsAt
    ? new Date(event.startsAt).toLocaleDateString(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

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

  return (
    <div className="min-h-screen">
      {/* Hero section */}
      <div className="relative bg-muted">
        <div className="container mx-auto px-4 py-12 max-w-7xl">
          <Link
            href="/events"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('title')}
          </Link>

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

      {/* Content */}
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-12">
            {/* About */}
            {event.description && (
              <section>
                <h2 className="text-2xl font-bold mb-4">{t('detail.about')}</h2>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="whitespace-pre-wrap">{event.description}</p>
                </div>
              </section>
            )}

            {/* Distances */}
            {event.distances.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6">{t('detail.distances')}</h2>
                <div className="grid gap-4">
                  {event.distances.map((distance) => (
                    <DistanceCard
                      key={distance.id}
                      distance={distance}
                      locale={locale}
                      isRegistrationOpen={event.isRegistrationOpen}
                      registerPath={{
                        pathname: '/events/[seriesSlug]/[editionSlug]/register',
                        params: { seriesSlug, editionSlug },
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* FAQ */}
            {event.faqItems.length > 0 && (
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
  isRegistrationOpen,
  registerPath,
}: {
  distance: PublicDistanceInfo;
  locale: string;
  isRegistrationOpen: boolean;
  registerPath: { pathname: '/events/[seriesSlug]/[editionSlug]/register'; params: { seriesSlug: string; editionSlug: string } };
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

  const distanceLabel = distance.distanceValue
    ? `${distance.distanceValue} ${distance.distanceUnit}`
    : distance.label;

  const isSoldOut = distance.spotsRemaining !== null && distance.spotsRemaining <= 0;

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 space-y-1">
        <h3 className="font-semibold">{distance.label}</h3>
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          {distance.distanceValue && (
            <span>{distanceLabel}</span>
          )}
          {distance.terrain && (
            <span>{t(`terrain.${distance.terrain as 'road' | 'trail' | 'mixed' | 'track'}`)}</span>
          )}
          {distance.isVirtual && (
            <span className="text-primary">{t('virtualEvent')}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {distance.capacity ? (
            isSoldOut ? (
              <span className="text-destructive flex items-center gap-1">
                <Users className="h-4 w-4" />
                {t('soldOut')}
              </span>
            ) : (
              <span className="text-muted-foreground flex items-center gap-1">
                <Users className="h-4 w-4" />
                {t('spotsRemaining', { count: distance.spotsRemaining ?? 0 })}
              </span>
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
        </div>
        {isRegistrationOpen && !isSoldOut && (
          <Button size="sm" asChild>
            <Link href={registerPath}>{t('selectDistance')}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
