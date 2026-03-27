import { Badge } from '@/components/common/badge';
import { MyRegistrationsSubnav } from '@/components/dashboard/my-registrations-subnav';
import { Button } from '@/components/ui/button';
import { InsetSurface, Surface } from '@/components/ui/surface';
import { getPathname, Link } from '@/i18n/navigation';
import { DEFAULT_TIMEZONE } from '@/i18n/routing';
import { getAuthContext } from '@/lib/auth/server';
import {
  parseMyRegistrationsView,
  type MyRegistrationsView,
} from '@/lib/events/my-registrations/view';
import { type MyRegistrationListItem, getMyRegistrations } from '@/lib/events/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { Calendar, ChevronRight, MapPin, Ticket } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

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

type MyRegistrationPageCopy = Awaited<
  ReturnType<typeof getTranslations<'pages.dashboard.myRegistrations'>>
>;

type RegistrationMetaItemProps = {
  icon: typeof Calendar;
  label: string;
  value: string;
};

function RegistrationMetaItem({ icon: Icon, label, value }: RegistrationMetaItemProps) {
  return (
    <div className="space-y-1.5">
      <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="flex items-start gap-2 text-sm leading-6 text-foreground/88">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span>{value}</span>
      </dd>
    </div>
  );
}

type RegistrationListItemProps = {
  locale: string;
  now: Date;
  registration: MyRegistrationListItem;
  statusLabels: Record<
    'confirmed' | 'payment_pending' | 'cancelled' | 'started' | 'submitted' | 'expired',
    string
  >;
  statusVariants: Record<string, 'default' | 'green' | 'blue' | 'indigo' | 'outline'>;
  t: MyRegistrationPageCopy;
};

function RegistrationListItem({
  locale,
  now,
  registration,
  statusLabels,
  statusVariants,
  t,
}: RegistrationListItemProps) {
  const isExpired =
    (registration.status === 'started' || registration.status === 'submitted') &&
    registration.expiresAt &&
    registration.expiresAt <= now;
  const statusKey = (isExpired ? 'expired' : registration.status) as keyof typeof statusLabels;
  const statusLabel = statusLabels[statusKey];
  const statusVariant = statusVariants[statusKey] ?? 'default';
  const location =
    registration.locationDisplay ||
    [registration.city, registration.state].filter(Boolean).join(', ');

  return (
    <Surface key={registration.id} className="p-5 sm:p-6">
      <div className="space-y-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={statusVariant}>{statusLabel}</Badge>
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('labels.ticketCode')}: {registration.ticketCode}
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-[1.45rem]">
                {registration.seriesName} {registration.editionLabel}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {registration.distanceLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:justify-end">
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

        <InsetSurface className="border-border/60 p-4 sm:p-5">
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <RegistrationMetaItem
              icon={Calendar}
              label={t('labels.eventDate')}
              value={formatEventDate(registration.startsAt, locale, registration.timezone)}
            />
            {location ? (
              <RegistrationMetaItem icon={MapPin} label={t('labels.location')} value={location} />
            ) : null}
            <RegistrationMetaItem
              icon={Ticket}
              label={t('labels.distance')}
              value={registration.distanceLabel}
            />
          </dl>
        </InsetSurface>
      </div>
    </Surface>
  );
}

export default async function MyRegistrationsPage({
  params,
  searchParams,
}: MyRegistrationsPageProps) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/dashboard/my-registrations' });
  const t = await getTranslations('pages.dashboard.myRegistrations');
  const authContext = await getAuthContext();

  if (!authContext.permissions.canAccessUserArea) {
    redirect(
      getPathname({
        href:
          authContext.isInternal && authContext.permissions.canAccessAdminArea
            ? '/admin'
            : '/dashboard',
        locale,
      }),
    );
  }

  const resolvedSearchParams = await searchParams;
  const view = parseMyRegistrationsView(resolvedSearchParams?.view);
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
  const statusVariants: Record<string, 'default' | 'green' | 'blue' | 'indigo' | 'outline'> = {
    confirmed: 'green',
    payment_pending: 'blue',
    cancelled: 'outline',
    started: 'indigo',
    submitted: 'indigo',
    expired: 'outline',
  };
  const viewLabels: Record<MyRegistrationsView, string> = {
    upcoming: t('tabs.upcoming'),
    in_progress: t('tabs.inProgress'),
    past: t('tabs.past'),
    cancelled: t('tabs.cancelled'),
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <Surface className="overflow-hidden border-border/60 p-6 sm:p-8">
        <div className="space-y-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <Badge variant="ghost">{viewLabels[view]}</Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  {t('description')}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Button asChild variant="outline">
                <Link href="/events">{t('emptyState.action')}</Link>
              </Button>
            </div>
          </div>

          <div className="border-t border-border/60 pt-4">
            <MyRegistrationsSubnav />
          </div>
        </div>
      </Surface>

      {registrations.length === 0 ? (
        <Surface className="p-6 sm:p-8">
          <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-5 py-8 text-center sm:gap-6 sm:py-12">
            <div className="rounded-full border border-border/70 bg-[color-mix(in_oklch,var(--background)_78%,var(--background-surface)_22%)] p-4">
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>

            <Badge variant="ghost">{viewLabels[view]}</Badge>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{t('emptyState.title')}</h2>
              <p className="max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
                {t('emptyState.description')}
              </p>
            </div>

            <Button asChild>
              <Link href="/events">{t('emptyState.action')}</Link>
            </Button>
          </div>
        </Surface>
      ) : (
        <div className="space-y-4">
          {registrations.map((registration) => (
            <RegistrationListItem
              key={registration.id}
              locale={locale}
              now={now}
              registration={registration}
              statusLabels={statusLabels}
              statusVariants={statusVariants}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
