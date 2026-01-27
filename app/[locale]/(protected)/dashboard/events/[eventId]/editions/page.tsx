import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail, getSeriesEditionsForDashboard } from '@/lib/events/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { EditionsManager } from './editions-manager';

type EditionsPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata({ params }: EditionsPageProps): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    return {
      title: 'Editions | RunGoMX',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Editions - ${event.seriesName} | RunGoMX`,
    robots: { index: false, follow: false },
  };
}

export default async function EventEditionsPage({ params }: EditionsPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/editions' });
  const t = await getTranslations('pages.dashboardEvents.editions');
  const authContext = await getAuthContext();

  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard ||
    authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  const event = await getEventEditionDetail(eventId);
  if (!event) {
    notFound();
  }

  const canAccess = await canUserAccessSeries(authContext.user!.id, event.seriesId);
  if (!canAccess) {
    redirect(getPathname({ href: '/dashboard/events', locale }));
  }

  const editions = await getSeriesEditionsForDashboard(event.seriesId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-2">{t('title')}</h2>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <EditionsManager
        currentEditionId={eventId}
        seriesId={event.seriesId}
        seriesName={event.seriesName}
        seriesSlug={event.seriesSlug}
        organizationId={event.organizationId}
        editions={editions.map((e) => ({
          id: e.id,
          slug: e.slug,
          editionLabel: e.editionLabel,
          visibility: e.visibility,
          startsAt: e.startsAt ? e.startsAt.toISOString() : null,
          createdAt: e.createdAt.toISOString(),
          previousEditionId: e.previousEditionId,
          clonedFromEditionId: e.clonedFromEditionId,
          registrationCount: e.registrationCount,
        }))}
      />
    </div>
  );
}
