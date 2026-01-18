import { getPathname, Link } from '@/i18n/navigation';
import { isEventsEnabled } from '@/lib/features/flags';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import { getAddOnsForEdition } from '@/lib/events/add-ons/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { AddOnsManager } from './add-ons-manager';

type AddOnsPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata({ params }: AddOnsPageProps): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    return {
      title: 'Add-ons | RunGoMX',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Add-ons - ${event.seriesName} ${event.editionLabel} | RunGoMX`,
    robots: { index: false, follow: false },
  };
}

export default async function EventAddOnsPage({ params }: AddOnsPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/add-ons' });
  const t = await getTranslations('pages.dashboard.events.addOns');
  const authContext = await getAuthContext();

  // Phase 0 gate
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

  // Get add-ons for this edition
  const addOns = await getAddOnsForEdition(eventId);

  // Transform distances for the client component
  const distances = event.distances.map((d) => ({
    id: d.id,
    label: d.label,
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          href={{ pathname: '/dashboard/events/[eventId]', params: { eventId } }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {event.seriesName} {event.editionLabel}
        </Link>
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <AddOnsManager
        editionId={eventId}
        distances={distances}
        initialAddOns={addOns}
      />
    </div>
  );
}
