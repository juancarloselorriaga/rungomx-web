import { Badge } from '@/components/common/badge';
import { MyRegistrationsSubnav } from '@/components/dashboard/my-registrations-subnav';
import { Button } from '@/components/ui/button';
import { getPathname, Link } from '@/i18n/navigation';
import { DEFAULT_TIMEZONE } from '@/i18n/routing';
import { getAuthContext } from '@/lib/auth/server';
import { getMyRegistrations, type MyRegistrationsView } from '@/lib/events/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { Calendar, ChevronRight, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

const VIEW_VALUES: MyRegistrationsView[] = ['upcoming', 'past', 'cancelled', 'in_progress'];

type MyRegistrationsPageProps = LocalePageProps & {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/my-registrations',
    (messages) => messages.Pages?.DashboardMyRegistrations?.metadata,
    { robots: { index: false, follow: false } },
  );
}

function formatEventDate(date: Date | null, locale: string, timezone?: string | null) {
  if (!date) return '-';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone || DEFAULT_TIMEZONE,
  }).format(date);
}

function resolveView(value: string | string[] | undefined): MyRegistrationsView {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && VIEW_VALUES.includes(raw as MyRegistrationsView)) {
    return raw as MyRegistrationsView;
  }
  return 'upcoming';
}

export default async function MyRegistrationsPage({ params, searchParams }: MyRegistrationsPageProps) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/dashboard/my-registrations' });
  const t = await getTranslations('pages.dashboard.myRegistrations');
  const authContext = await getAuthContext();

  if (!authContext.permissions.canAccessUserArea) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  const resolvedSearchParams = await searchParams;
  const view = resolveView(resolvedSearchParams?.view);
  const now = new Date();
  const registrations = await getMyRegistrations(authContext.user!.id, { view, now });

  const statusLabels = {
    confirmed: t('status.confirmed'),
    payment_pending: t('status.payment_pending'),
    cancelled: t('status.cancelled'),
    started: t('status.started'),
    submitted: t('status.submitted'),
    expired: t('status.expired'),
  } as const;
  type StatusKey = keyof typeof statusLabels;
  const statusVariants: Record<string, 'default' | 'green' | 'blue' | 'indigo' | 'outline'> = {
    confirmed: 'green',
    payment_pending: 'blue',
    cancelled: 'outline',
    started: 'indigo',
    submitted: 'indigo',
    expired: 'outline',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <MyRegistrationsSubnav />

      {registrations.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 shadow-sm">
          <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
            <div className="rounded-full bg-muted p-4">
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{t('emptyState.title')}</h2>
              <p className="text-muted-foreground max-w-md">{t('emptyState.description')}</p>
            </div>
            <Button asChild>
              <Link href="/events">{t('emptyState.action')}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {registrations.map((registration) => {
            const isExpired =
              (registration.status === 'started' || registration.status === 'submitted') &&
              registration.expiresAt &&
              registration.expiresAt <= now;
            const statusKey = (isExpired ? 'expired' : registration.status) as StatusKey;
            const statusLabel = statusLabels[statusKey];
            const statusVariant = statusVariants[statusKey] ?? 'default';
            const location =
              registration.locationDisplay ||
              [registration.city, registration.state].filter(Boolean).join(', ');

            return (
              <div
                key={registration.id}
                className="rounded-lg border bg-card p-6 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold">
                        {registration.seriesName} {registration.editionLabel}
                      </h3>
                      <Badge variant={statusVariant}>{statusLabel}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {formatEventDate(
                            registration.startsAt,
                            locale,
                            registration.timezone,
                          )}
                        </span>
                      </div>
                      {location ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          <span>{location}</span>
                        </div>
                      ) : null}
                      <div className="text-xs uppercase tracking-wide">
                        {t('labels.ticketCode')}: {registration.ticketCode}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('labels.distance')}: {registration.distanceLabel}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button asChild variant="outline">
                      <Link
                        href={{
                          pathname: '/events/[seriesSlug]/[editionSlug]',
                          params: {
                            seriesSlug: registration.seriesSlug,
                            editionSlug: registration.editionSlug,
                          },
                        }}
                      >
                        {t('actions.viewEvent')}
                      </Link>
                    </Button>
                    <Button asChild>
                      <Link
                        href={{
                          pathname: '/dashboard/my-registrations/[registrationId]',
                          params: { registrationId: registration.id },
                        }}
                      >
                        {t('actions.viewDetails')}
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
