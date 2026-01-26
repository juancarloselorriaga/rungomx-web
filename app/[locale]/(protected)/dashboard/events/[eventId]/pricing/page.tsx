import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import { getPricingScheduleForEdition } from '@/lib/events/pricing/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { PricingTiersManager } from './pricing-tiers-manager';

type PricingPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata({ params }: PricingPageProps): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    return {
      title: 'Pricing | RunGoMX',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Pricing - ${event.seriesName} ${event.editionLabel} | RunGoMX`,
    robots: { index: false, follow: false },
  };
}

export default async function EventPricingPage({ params }: PricingPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/pricing' });
  const t = await getTranslations('pages.dashboardEvents.pricing');
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

  // Get pricing data for all distances
  const pricingData = await getPricingScheduleForEdition(eventId);

  // Transform distances for the client component
  const distances = event.distances.map((d) => ({
    id: d.id,
    label: d.label,
    distanceValue: d.distanceValue,
    distanceUnit: d.distanceUnit,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-2">{t('title')}</h2>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <div className="max-w-4xl">
        <PricingTiersManager
          distances={distances}
          initialPricingData={pricingData}
        />
      </div>
    </div>
  );
}
