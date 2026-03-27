import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import type { EventVisibility } from '@/lib/events/constants';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { configPageLocale } from '@/utils/config-page-locale';
import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import { ReactNode } from 'react';

import { EventDetailLayoutShell } from './event-detail-layout-shell';

type EventLayoutProps = {
  params: Promise<{ locale: string; eventId: string }>;
  children: ReactNode;
};

export default async function EventDetailLayout({
  params,
  children,
}: EventLayoutProps) {
  const { eventId } = await params;
  const { locale } = await configPageLocale(params, { pathname: '/dashboard/events/[eventId]' });
  await connection();
  const t = await getTranslations('pages.dashboardEvents.detail');
  const tEvents = await getTranslations('pages.dashboardEvents');
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

  // Check if user can access this event's series
  const canAccess = await canUserAccessSeries(authContext.user!.id, event.seriesId);
  if (!canAccess) {
    redirect(getPathname({ href: '/dashboard/events', locale }));
  }

  const footerLink = [
    ...(event.visibility === 'published'
      ? [
          {
            label: t('viewPublicPage'),
            href: {
              pathname: '/events/[seriesSlug]/[editionSlug]',
              params: { seriesSlug: event.seriesSlug, editionSlug: event.slug },
            },
            icon: 'externalLink' as const,
            external: true,
          },
        ]
      : []),
    {
      label: t('openSetupWizard'),
      href: `/dashboard/events/${eventId}/settings?wizard=1`,
      icon: 'settings' as const,
      external: false,
    },
  ];

  return (
    <EventDetailLayoutShell
      title={`${event.seriesName} ${event.editionLabel}`}
      subtitle={event.organizationName}
      metaBadge={{
        label: tEvents(`visibility.${event.visibility as EventVisibility}`),
        tone: (event.visibility as EventVisibility) ?? 'draft',
      }}
      params={{ eventId }}
      basePath={`/dashboard/events/${eventId}`}
      footerLink={footerLink}
    >
      {children}
    </EventDetailLayoutShell>
  );
}
