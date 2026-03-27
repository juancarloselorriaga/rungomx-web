import { getPathname } from '@/i18n/navigation';
import { InsetSurface, Surface } from '@/components/ui/surface';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import { getRegistrationsForEdition } from '@/lib/events/registrations';
import { canUserAccessEvent, requireOrgPermission } from '@/lib/organizations/permissions';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { Users } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { RegistrationsTable } from './registrations-table';
import { ExportRegistrationsButton } from './export-registrations-button';
import type { RegistrationStatus } from '@/lib/events/constants';

type RegistrationsPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams?: Promise<{
    distanceId?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
};

export async function generateMetadata({ params }: RegistrationsPageProps): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    return {
      title: 'Registrations | RunGoMX',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Registrations - ${event.seriesName} ${event.editionLabel} | RunGoMX`,
    robots: { index: false, follow: false },
  };
}

export default async function RegistrationsPage({ params, searchParams }: RegistrationsPageProps) {
  const { locale, eventId } = await params;
  const resolvedSearchParams = await searchParams;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/registrations' });
  const t = await getTranslations('pages.eventsRegistrations');
  const authContext = await getAuthContext();

  // Access gate: organizers and internal staff only.
  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard || authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  // Get event details
  const event = await getEventEditionDetail(eventId);
  if (!event) {
    notFound();
  }

  // Check if user can access this event's edition
  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user!.id, eventId);
    if (!membership) {
      redirect(getPathname({ href: '/dashboard/events', locale }));
    }
  }

  // Parse filters
  const distanceId = resolvedSearchParams?.distanceId;
  const status = resolvedSearchParams?.status as RegistrationStatus | undefined;
  const search = resolvedSearchParams?.search;
  const dateFrom = resolvedSearchParams?.dateFrom;
  const dateTo = resolvedSearchParams?.dateTo;
  const page = parseInt(resolvedSearchParams?.page || '1', 10);
  const limit = 25;
  const offset = (page - 1) * limit;

  const parseDateBoundary = (value: string | undefined, kind: 'start' | 'end') => {
    if (!value) return undefined;
    const date = new Date(`${value}T${kind === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };

  const createdFrom = parseDateBoundary(dateFrom, 'start');
  const createdTo = parseDateBoundary(dateTo, 'end');

  // Get registrations
  const { items: registrations, total } = await getRegistrationsForEdition({
    editionId: eventId,
    distanceId,
    status,
    search,
    createdFrom,
    createdTo,
    limit,
    offset,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const totalPages = Math.ceil(total / limit);

  // Check if user can export
  let canExport = authContext.permissions.canManageEvents;
  if (!canExport) {
    const membership = await canUserAccessEvent(authContext.user!.id, eventId);
    try {
      requireOrgPermission(membership, 'canExportRegistrations');
      canExport = true;
    } catch {
      canExport = false;
    }
  }

  return (
    <div className="space-y-6">
      <Surface className="overflow-hidden border-border/60 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="min-w-0 space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              {t('description')}
            </p>
            {canExport && (
              <ExportRegistrationsButton
                editionId={eventId}
                distanceId={distanceId}
                status={status}
                search={search}
                dateFrom={dateFrom}
                dateTo={dateTo}
              />
            )}
          </div>
          <InsetSurface className="border-border/60 bg-background/80 p-5">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t('title')}
              </p>
              <p className="text-sm font-medium text-foreground">
                {event.seriesName} {event.editionLabel}
              </p>
              <p className="text-sm text-muted-foreground">{event.organizationName}</p>
            </div>
          </InsetSurface>
        </div>
      </Surface>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Surface className="space-y-1.5 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">{t('stats.total')}</span>
          </div>
          <p className="text-2xl font-bold">{total}</p>
        </Surface>
        <Surface className="space-y-1.5 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <span className="text-sm font-medium">{t('stats.distances')}</span>
          </div>
          <p className="text-2xl font-bold">{event.distances.length}</p>
        </Surface>
        <Surface className="space-y-1.5 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <span className="text-sm font-medium">{t('stats.avgPerDistance')}</span>
          </div>
          <p className="text-2xl font-bold">
            {event.distances.length > 0 ? Math.round(total / event.distances.length) : 0}
          </p>
        </Surface>
      </div>

      {/* Registrations Table */}
      <Surface className="p-0">
        <RegistrationsTable
          registrations={registrations}
          distances={event.distances}
          eventId={eventId}
          currentDistanceId={distanceId}
          currentStatus={status}
          currentSearch={search}
          currentDateFrom={dateFrom}
          currentDateTo={dateTo}
          currentPage={page}
          totalPages={totalPages}
          total={total}
          locale={locale}
        />
      </Surface>
    </div>
  );
}
