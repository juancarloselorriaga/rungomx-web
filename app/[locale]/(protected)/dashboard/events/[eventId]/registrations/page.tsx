import { getPathname, Link } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import { getRegistrationsForEdition } from '@/lib/events/registrations';
import { canUserAccessEvent, requireOrgPermission } from '@/lib/organizations/permissions';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { ArrowLeft, Users } from 'lucide-react';
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
    authContext.permissions.canViewOrganizersDashboard ||
    authContext.permissions.canManageEvents;
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
      {/* Header */}
      <div>
        <Link
          href={{ pathname: '/dashboard/events/[eventId]', params: { eventId } }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {event.seriesName} {event.editionLabel}
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <p className="text-muted-foreground mt-1">{t('description')}</p>
          </div>
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
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">{t('stats.total')}</span>
          </div>
          <p className="text-2xl font-bold">{total}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <span className="text-sm font-medium">{t('stats.distances')}</span>
          </div>
          <p className="text-2xl font-bold">{event.distances.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <span className="text-sm font-medium">{t('stats.avgPerDistance')}</span>
          </div>
          <p className="text-2xl font-bold">
            {event.distances.length > 0
              ? Math.round(total / event.distances.length)
              : 0}
          </p>
        </div>
      </div>

      {/* Registrations Table */}
      <div className="rounded-lg border bg-card shadow-sm">
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
      </div>
    </div>
  );
}
