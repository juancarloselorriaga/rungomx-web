import { Suspense } from 'react';
import {
  getPublicEventBySlug,
  getPublicOtherEditionsForSeries,
} from '@/lib/events/queries';
import { resolveEventSlugRedirect } from '@/lib/events/slug-redirects';
import { getPricingScheduleForEdition } from '@/lib/events/pricing/queries';
import {
  getPublicWebsiteContent,
  resolveWebsiteMediaUrls,
  getEventSponsors,
  resolveSponsorMediaUrls,
} from '@/lib/events/website/queries';
import type { SportType } from '@/lib/events/constants';
import { getPathname } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { generateAlternateMetadata } from '@/utils/seo';
import { FileText, Image as ImageIcon, Info, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  SectionWrapper,
  EventMobileUI,
  TabToAnchorRedirect,
  EventHeroSection,
  DistanceCard,
  EventSidebar,
} from './components';
import { WebsiteContentRenderer } from './website-content-renderer';
import { SponsorBanner } from '@/components/events/sponsor-banner';
import { PhotoGallery } from '@/components/events/photo-gallery';
import { MarkdownContent } from '@/components/markdown/markdown-content';

type EventDetailPageProps = LocalePageProps & {
  params: Promise<{ locale: string; seriesSlug: string; editionSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const stripMarkdown = (value: string) =>
  value
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[`*_>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

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

  const descriptionText = event.description?.trim()
    ? stripMarkdown(event.description)
    : `${event.seriesName} - ${location}`;

  return {
    title: `${event.seriesName} ${event.editionLabel} | RunGoMX`,
    description: descriptionText,
    alternates: { canonical, languages },
    openGraph: {
      title: `${event.seriesName} ${event.editionLabel}`,
      description: descriptionText,
      type: 'website',
      url: canonical,
      locale: openGraphLocale,
    },
    ...(event.visibility === 'unlisted'
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { locale, seriesSlug, editionSlug } = await params;
  await configPageLocale(params, { pathname: '/events/[seriesSlug]/[editionSlug]' });

  const t = await getTranslations({ locale, namespace: 'pages.events' });
  const event = await getPublicEventBySlug(seriesSlug, editionSlug);

  if (!event) {
    const redirectTarget = await resolveEventSlugRedirect(seriesSlug, editionSlug);
    if (redirectTarget) {
      permanentRedirect(
        getPathname({
          href: {
            pathname: '/events/[seriesSlug]/[editionSlug]',
            params: {
              seriesSlug: redirectTarget.seriesSlug,
              editionSlug: redirectTarget.editionSlug,
            },
          },
          locale,
        }),
      );
    }
    notFound();
  }

  // Load all data in parallel
  const [websiteContent, pricingSchedule, otherEditions, sponsorsData] = await Promise.all([
    getPublicWebsiteContent(event.id, locale),
    getPricingScheduleForEdition(event.id),
    getPublicOtherEditionsForSeries(event.seriesId, event.id),
    getEventSponsors(event.id, locale),
  ]);

  const mediaUrls = websiteContent ? await resolveWebsiteMediaUrls(websiteContent) : undefined;
  const sponsorMediaUrls = sponsorsData ? await resolveSponsorMediaUrls(sponsorsData) : undefined;
  const pricingScheduleByDistanceId = pricingSchedule
    ? new Map(pricingSchedule.map((item) => [item.distanceId, item]))
    : null;

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

  // Build policy sections
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
  const policySections = policyConfig
    ? [
        { key: 'refund' as const, enabled: policyConfig.refundsAllowed, text: policyConfig.refundPolicyText, deadline: policyConfig.refundDeadline },
        { key: 'transfer' as const, enabled: policyConfig.transfersAllowed, text: policyConfig.transferPolicyText, deadline: policyConfig.transferDeadline },
        { key: 'deferral' as const, enabled: policyConfig.deferralsAllowed, text: policyConfig.deferralPolicyText, deadline: policyConfig.deferralDeadline },
      ]
    : [];

  // Computed values
  const location = event.locationDisplay || [event.city, event.state].filter(Boolean).join(', ');
  const minPrice = event.distances.reduce((min, d) => (d.priceCents < min ? d.priceCents : min), event.distances[0]?.priceCents ?? 0);
  const formatPrice = (cents: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
  const formattedMinPrice = minPrice > 0 ? formatPrice(minPrice, event.distances[0]?.currency ?? 'MXN') : null;

  // Content availability checks
  const hasSharedPool = event.sharedCapacity !== null && event.distances.some((d) => d.capacityScope === 'shared_pool');
  const hasDescription = Boolean(event.description);
  const hasDistances = event.distances.length > 0;
  const hasGroupDiscounts = event.groupDiscountRules.length > 0;
  const minGroupParticipants = hasGroupDiscounts ? event.groupDiscountRules[0].minParticipants : 0;
  const maxGroupDiscountPercent = hasGroupDiscounts
    ? Math.max(...event.groupDiscountRules.map((rule) => rule.percentOff))
    : 0;
  const hasFaq = event.faqItems.length > 0;
  const hasPolicies = policySections.some((p) => p.enabled || p.text || p.deadline);

  const course = websiteContent?.course;
  const schedule = websiteContent?.schedule;
  const media = websiteContent?.media;
  const hasPhotos = Boolean(media?.enabled) && Boolean((media?.photos?.length ?? 0) > 0);
  const hasDocuments = Boolean(media?.enabled) && Boolean((media?.documents?.length ?? 0) > 0);
  const hasCourseContent = Boolean(course?.enabled) && Boolean(course?.title || course?.description || course?.elevationGain || course?.elevationProfileUrl || course?.mapUrl || (course?.aidStations?.length ?? 0) > 0);
  const hasScheduleContent = Boolean(schedule?.enabled) && Boolean(schedule?.title || schedule?.packetPickup || schedule?.parking || schedule?.raceDay || (schedule?.startTimes?.length ?? 0) > 0);

  return (
    <div className="min-h-screen scroll-smooth">
      {/* URL Migration for backward compatibility */}
      <Suspense fallback={null}>
        <TabToAnchorRedirect />
      </Suspense>

      {/* Mobile UI (sticky bar + info sheet) */}
      <EventMobileUI
        eventName={`${event.seriesName} ${event.editionLabel}`}
        price={formattedMinPrice}
        seriesSlug={seriesSlug}
        editionSlug={editionSlug}
        isRegistrationOpen={event.isRegistrationOpen}
        eventDate={eventDate}
        location={location}
        address={event.address}
        latitude={event.latitude}
        longitude={event.longitude}
        organizationName={event.organizationName}
        externalUrl={event.externalUrl}
        registrationOpensAt={registrationOpensAt}
        registrationClosesAt={registrationClosesAt}
        isRegistrationPaused={event.isRegistrationPaused}
        otherEditions={otherEditions}
        locale={locale}
        labels={{
          registerNow: t('detail.registerNow'),
          free: t('detail.free'),
          eventDate: t('detail.eventDate'),
          location: t('detail.location'),
          organizer: t('detail.organizer'),
          viewMap: t('detail.viewMap'),
          registrationDetails: t('detail.registrationDetails'),
          registrationOpens: registrationOpensAt ? t('detail.registrationOpens', { date: registrationOpensAt }) : '',
          registrationCloses: registrationClosesAt ? t('detail.registrationCloses', { date: registrationClosesAt }) : '',
          registrationPaused: t('detail.registrationPaused'),
          registrationOpen: t('detail.registrationOpen'),
          registrationClosed: t('detail.registrationClosed'),
          otherEditionsTitle: t('detail.otherEditions.title'),
        }}
      />

      {/* Hero Section */}
      <EventHeroSection
        seriesSlug={seriesSlug}
        editionSlug={editionSlug}
        seriesName={event.seriesName}
        editionLabel={event.editionLabel}
        sportTypeLabel={t(`sportTypes.${event.sportType as SportType}`)}
        heroImageUrl={event.heroImageUrl}
        eventDate={eventDate}
        location={location}
        isRegistrationOpen={event.isRegistrationOpen}
        formattedMinPrice={formattedMinPrice}
        groupDiscountRules={event.groupDiscountRules}
        labels={{
          backToEvents: t('title'),
          registrationOpen: t('detail.registrationOpen'),
          registrationClosed: t('detail.registrationClosed'),
          fromPrice: formattedMinPrice ? t('detail.fromPrice', { price: formattedMinPrice }) : '',
          free: t('detail.free'),
          registerNow: t('detail.registerNow'),
          groupDiscountBadge: event.groupDiscountRules[0]
            ? t('detail.groupDiscount.badge', {
                minParticipants: event.groupDiscountRules[0].minParticipants,
                percent: event.groupDiscountRules[0].percentOff,
              })
            : undefined,
        }}
      />

      {/* Sponsor Banner */}
      {sponsorsData && sponsorMediaUrls && (
        <SponsorBanner sponsors={sponsorsData} mediaUrls={sponsorMediaUrls} />
      )}

      {/* Content */}
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-12">
            {/* Overview */}
            {hasDescription && (
              <SectionWrapper id="overview" title={t('detail.sections.overview')}>
                <MarkdownContent content={event.description ?? ''} className="text-sm" />
              </SectionWrapper>
            )}

            {/* Photos */}
            {hasPhotos && media && (
              <SectionWrapper id="photos" title={t('detail.sections.photos')} icon={<ImageIcon className="h-6 w-6" />}>
                <PhotoGallery
                  photos={media.photos!.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((photo) => ({
                    url: mediaUrls?.get(photo.mediaId) || '',
                    caption: photo.caption,
                    mediaId: photo.mediaId,
                  }))}
                  columns={3}
                  initialCount={6}
                  loadMoreCount={12}
                  labels={{ loadMore: t('detail.website.gallery.loadMore'), showingOf: t('detail.website.gallery.showingOf') }}
                />
              </SectionWrapper>
            )}

            {/* Distances */}
            {hasDistances && (
              <SectionWrapper id="distances" title={t('detail.sections.distances')}>
                {hasSharedPool && event.sharedCapacity && (
                  <div className="rounded-lg border bg-muted/40 p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-sm font-medium">
                        {t('detail.capacity.sharedPoolBanner', { total: event.sharedCapacity })}
                      </p>
                    </div>
                  </div>
                )}
                {hasGroupDiscounts && (
                  <div className="rounded-lg border bg-emerald-50/60 dark:bg-emerald-900/20 p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-300 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                          {t('detail.groupDiscount.calloutTitle')}
                        </p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-200">
                          {t('detail.groupDiscount.calloutDescription', {
                            minParticipants: minGroupParticipants,
                            percent: maxGroupDiscountPercent,
                          })}
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
                      bestGroupDiscount={event.groupDiscountRules[0]}
                    />
                  ))}
                </div>
              </SectionWrapper>
            )}

            {/* Course */}
            {hasCourseContent && course && (
              <SectionWrapper id="course">
                <WebsiteContentRenderer
                  blocks={{ course, overview: undefined, schedule: undefined, media: undefined, sponsors: undefined }}
                  mediaUrls={mediaUrls}
                  labels={{ terrain: t('detail.website.terrain') }}
                />
              </SectionWrapper>
            )}

            {/* Schedule */}
            {hasScheduleContent && schedule && (
              <SectionWrapper id="schedule">
                <WebsiteContentRenderer
                  blocks={{ schedule, overview: undefined, course: undefined, media: undefined, sponsors: undefined }}
                  mediaUrls={mediaUrls}
                />
              </SectionWrapper>
            )}

            {/* FAQ */}
            {hasFaq && (
              <SectionWrapper id="faq" title={t('detail.sections.faq')} collapsible defaultCollapsed={false}>
                <div className="space-y-4">
                  {event.faqItems.map((item) => (
                    <details key={item.id} className="group rounded-lg border bg-card p-4">
                      <summary className="font-medium cursor-pointer list-none flex items-center justify-between">
                        {item.question}
                        <span className="ml-2 text-muted-foreground transition-transform group-open:rotate-180">▼</span>
                      </summary>
                      {item.answer ? (
                        <div className="mt-3">
                          <MarkdownContent
                            content={item.answer}
                            className="text-sm text-muted-foreground [&_p]:m-0"
                          />
                        </div>
                      ) : null}
                    </details>
                  ))}
                </div>
              </SectionWrapper>
            )}

            {/* Documents */}
            {hasDocuments && media && (
              <SectionWrapper id="documents" title={t('detail.sections.documents')} icon={<FileText className="h-6 w-6" />}>
                <div className="grid gap-2">
                  {media.documents!.map((doc, index) => {
                    const url = mediaUrls?.get(doc.mediaId);
                    return url ? (
                      <a
                        key={doc.mediaId}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border bg-card p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors group"
                      >
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <span className="text-sm font-medium flex-1">{doc.label}</span>
                        <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                          {t('detail.website.download')}
                        </span>
                      </a>
                    ) : (
                      <div key={doc.mediaId || index} className="rounded-lg border bg-card p-3 flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">{doc.label}</span>
                      </div>
                    );
                  })}
                </div>
              </SectionWrapper>
            )}

            {/* Policies */}
            {hasPolicies && (
              <SectionWrapper id="policies" title={t('detail.sections.policies')} collapsible defaultCollapsed={true}>
                <div className="grid gap-4">
                  {policySections.map((policy) => {
                    if (!policy.enabled && !policy.text && !policy.deadline) return null;
                    const deadlineText = policy.deadline
                      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: event.timezone }).format(new Date(policy.deadline))
                      : null;
                    return (
                      <div key={policy.key} className="rounded-lg border bg-card p-4">
                        <h3 className="font-semibold">{policyCopy[policy.key].title}</h3>
                        {policy.text && (
                          <div className="mt-2">
                            <MarkdownContent
                              content={policy.text}
                              className="text-sm text-muted-foreground [&_p]:m-0"
                            />
                          </div>
                        )}
                        {deadlineText && <p className="text-xs text-muted-foreground mt-3">{policyCopy[policy.key].deadline(deadlineText)}</p>}
                      </div>
                    );
                  })}
                </div>
              </SectionWrapper>
            )}
          </div>

          {/* Sidebar */}
          <EventSidebar
            seriesSlug={seriesSlug}
            eventDate={eventDate}
            location={location}
            address={event.address}
            latitude={event.latitude}
            longitude={event.longitude}
            organizationName={event.organizationName}
            externalUrl={event.externalUrl}
            registrationOpensAt={registrationOpensAt}
            registrationClosesAt={registrationClosesAt}
            isRegistrationPaused={event.isRegistrationPaused}
            otherEditions={otherEditions}
            locale={locale}
            labels={{
              eventDate: t('detail.eventDate'),
              location: t('detail.location'),
              organizer: t('detail.organizer'),
              viewMap: t('detail.viewMap'),
              registrationDetails: t('detail.registrationDetails'),
              registrationOpens: registrationOpensAt ? t('detail.registrationOpens', { date: registrationOpensAt }) : '',
              registrationCloses: registrationClosesAt ? t('detail.registrationCloses', { date: registrationClosesAt }) : '',
              registrationPaused: t('detail.registrationPaused'),
              registrationOpen: t('detail.registrationOpen'),
              registrationClosed: t('detail.registrationClosed'),
              otherEditionsTitle: t('detail.otherEditions.title'),
            }}
          />
        </div>
      </div>
    </div>
  );
}
