import { getPathname, Link } from '@/i18n/navigation';
import { isEventsEnabled } from '@/lib/features/flags';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import {
  ArrowLeft,
  Calendar,
  ClipboardList,
  ExternalLink,
  FileText,
  HelpCircle,
  MapPin,
  Settings,
  Ticket,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

type EventDetailPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { locale, eventId } = await params;
  const event = await getEventEditionDetail(eventId);
  
  if (!event) {
    return createLocalizedPageMetadata(
      locale,
      '/dashboard/events/[eventId]',
      (messages) => messages.Pages?.DashboardEvents?.metadata,
      { robots: { index: false, follow: false } },
    );
  }

  return {
    title: `${event.seriesName} ${event.editionLabel} | RunGoMX`,
    robots: { index: false, follow: false },
  };
}

function formatDate(date: Date | null, locale: string): string {
  if (!date) return '-';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
  }).format(date);
}

type VisibilityType = 'draft' | 'published' | 'unlisted' | 'archived';

const visibilityStyles: Record<VisibilityType, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  unlisted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  archived: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]' });
  const t = await getTranslations('pages.dashboard.events');
  const tDetail = await getTranslations('pages.dashboard.events.detail');
  const authContext = await getAuthContext();

  // Phase 0 gate: organizers need flag enabled, internal staff with canManageEvents bypass
  const canAccessEvents =
    (isEventsEnabled() && authContext.permissions.canViewOrganizersDashboard) ||
    authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  // Get event details
  const event = await getEventEditionDetail(eventId);
  if (!event) {
    notFound();
  }

  // Check if user can access this event's series
  const canAccess = await canUserAccessSeries(authContext.user!.id, event.seriesId);
  if (!canAccess) {
    redirect(getPathname({ href: '/dashboard/events', locale }));
  }

  // Calculate total registrations
  const totalRegistrations = event.distances.reduce(
    (sum, d) => sum + d.registrationCount,
    0,
  );
  const hasSharedPool =
    Boolean(event.sharedCapacity) ||
    event.distances.some((distance) => distance.capacityScope === 'shared_pool');
  const sharedSpotsRemaining = hasSharedPool
    ? Math.max((event.sharedCapacity ?? 0) - totalRegistrations, 0)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/events"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('title')}
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">
                {event.seriesName} {event.editionLabel}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  visibilityStyles[event.visibility as VisibilityType] ||
                  visibilityStyles.draft
                }`}
              >
                {t(`visibility.${event.visibility as VisibilityType}`)}
              </span>
            </div>
            <p className="text-muted-foreground mt-1">{event.organizationName}</p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm">
              <span className="text-muted-foreground">{tDetail('publicCodeLabel')}</span>
              <span className="font-mono font-semibold">{event.publicCode}</span>
            </div>
          </div>
          <Link
            href={{ pathname: '/dashboard/events/[eventId]/settings', params: { eventId } }}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Settings className="h-4 w-4" />
            {tDetail('settings')}
          </Link>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Calendar className="h-4 w-4" />
            <span className="text-sm font-medium">{tDetail('eventDate')}</span>
          </div>
          <p className="text-lg font-semibold">
            {formatDate(event.startsAt, locale)}
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <MapPin className="h-4 w-4" />
            <span className="text-sm font-medium">{tDetail('location')}</span>
          </div>
          <p className="text-lg font-semibold">
            {[event.city, event.state].filter(Boolean).join(', ') || '-'}
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Ticket className="h-4 w-4" />
            <span className="text-sm font-medium">{tDetail('distances')}</span>
          </div>
          <p className="text-lg font-semibold">{event.distances.length}</p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">{tDetail('registrations')}</span>
          </div>
          <p className="text-lg font-semibold">{totalRegistrations}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href={{ pathname: '/dashboard/events/[eventId]/settings', params: { eventId } }}
          className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm hover:border-primary/50 hover:shadow-md transition-all"
        >
          <div className="rounded-full bg-muted p-3">
            <Settings className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold">{tDetail('manageEvent')}</h3>
            <p className="text-sm text-muted-foreground">{tDetail('manageEventDescription')}</p>
          </div>
        </Link>

        <Link
          href={{ pathname: '/dashboard/events/[eventId]/faq', params: { eventId } }}
          className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm hover:border-primary/50 hover:shadow-md transition-all"
        >
          <div className="rounded-full bg-muted p-3">
            <HelpCircle className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold">{tDetail('manageFaq')}</h3>
            <p className="text-sm text-muted-foreground">{tDetail('manageFaqDescription')}</p>
          </div>
        </Link>

        <Link
          href={{ pathname: '/dashboard/events/[eventId]/waivers', params: { eventId } }}
          className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm hover:border-primary/50 hover:shadow-md transition-all"
        >
          <div className="rounded-full bg-muted p-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold">{tDetail('manageWaivers')}</h3>
            <p className="text-sm text-muted-foreground">{tDetail('manageWaiversDescription')}</p>
          </div>
        </Link>

        <Link
          href={{ pathname: '/dashboard/events/[eventId]/policies', params: { eventId } }}
          className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm hover:border-primary/50 hover:shadow-md transition-all"
        >
          <div className="rounded-full bg-muted p-3">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold">{tDetail('managePolicies')}</h3>
            <p className="text-sm text-muted-foreground">{tDetail('managePoliciesDescription')}</p>
          </div>
        </Link>

        {event.visibility === 'published' && (
          <Link
            href={{ 
              pathname: '/events/[seriesSlug]/[editionSlug]', 
              params: { seriesSlug: event.seriesSlug, editionSlug: event.slug } 
            }}
            className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm hover:border-primary/50 hover:shadow-md transition-all"
          >
            <div className="rounded-full bg-muted p-3">
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold">{tDetail('viewPublicPage')}</h3>
              <p className="text-sm text-muted-foreground">{tDetail('viewPublicPageDescription')}</p>
            </div>
          </Link>
        )}
      </div>

      {/* Capacity status */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{tDetail('capacity.title')}</h2>
        </div>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {hasSharedPool ? tDetail('capacity.sharedPool') : tDetail('capacity.perDistance')}
          </p>

          {hasSharedPool ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">{tDetail('capacity.totalLabel')}</p>
                <p className="text-lg font-semibold">{event.sharedCapacity}</p>
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  {tDetail('capacity.remainingLabel')}
                </p>
                <p className="text-lg font-semibold">
                  {sharedSpotsRemaining === 0
                    ? tDetail('capacity.soldOut')
                    : sharedSpotsRemaining}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="divide-y">
                {event.distances.slice(0, 5).map((distance) => {
                const remaining =
                  distance.capacity !== null
                    ? Math.max(distance.capacity - distance.registrationCount, 0)
                    : null;
                return (
                  <div key={distance.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{distance.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {distance.capacity !== null
                          ? tDetail('capacity.distanceLimit', { count: distance.capacity })
                          : tDetail('capacity.unlimited')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {tDetail('capacity.remainingLabel')}
                      </p>
                      <p className="font-semibold">
                        {remaining === null
                          ? tDetail('capacity.unlimited')
                          : remaining === 0
                            ? tDetail('capacity.soldOut')
                            : remaining}
                      </p>
                    </div>
                  </div>
                );
                })}
              </div>

              {event.distances.length > 5 && (
                <details className="rounded-md border bg-muted/30 px-4 py-2">
                  <summary className="cursor-pointer text-sm font-medium text-primary">
                    {tDetail('capacity.viewAll', {
                      count: event.distances.length - 5,
                    })}
                  </summary>
                  <div className="mt-3 divide-y">
                    {event.distances.slice(5).map((distance) => {
                      const remaining =
                        distance.capacity !== null
                          ? Math.max(distance.capacity - distance.registrationCount, 0)
                          : null;
                      return (
                        <div key={distance.id} className="py-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium">{distance.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {distance.capacity !== null
                                ? tDetail('capacity.distanceLimit', { count: distance.capacity })
                                : tDetail('capacity.unlimited')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">
                              {tDetail('capacity.remainingLabel')}
                            </p>
                            <p className="font-semibold">
                              {remaining === null
                                ? tDetail('capacity.unlimited')
                                : remaining === 0
                                  ? tDetail('capacity.soldOut')
                                  : remaining}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Distances section */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{tDetail('distancesTitle')}</h2>
        </div>
        {event.distances.length === 0 ? (
          <div className="px-6 py-8 text-center text-muted-foreground">
            {tDetail('noDistances')}
          </div>
        ) : (
          <div className="divide-y">
            {event.distances.map((distance) => (
              <div key={distance.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{distance.label}</h3>
                  <p className="text-sm text-muted-foreground">
                    {distance.distanceValue} {distance.distanceUnit}
                    {distance.terrain && ` • ${distance.terrain}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">
                    {(distance.priceCents / 100).toLocaleString(locale, {
                      style: 'currency',
                      currency: distance.currency,
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {distance.registrationCount}
                    {distance.capacity && ` / ${distance.capacity}`} {t('registrations')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAQ preview */}
      {event.faqItems.length > 0 && (
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="border-b px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{tDetail('faqTitle')}</h2>
            <Link
              href={{ pathname: '/dashboard/events/[eventId]/faq', params: { eventId } }}
              className="text-sm text-primary hover:underline"
            >
              {tDetail('editFaq')}
            </Link>
          </div>
          <div className="divide-y">
            {event.faqItems.slice(0, 3).map((faq) => (
              <div key={faq.id} className="px-6 py-4">
                <h3 className="font-medium">{faq.question}</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{faq.answer}</p>
              </div>
            ))}
            {event.faqItems.length > 3 && (
              <div className="px-6 py-3 text-center">
                <Link
                  href={{ pathname: '/dashboard/events/[eventId]/faq', params: { eventId } }}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {tDetail('viewAllFaq', { count: event.faqItems.length - 3 })}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
