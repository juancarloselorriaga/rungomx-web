import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import { getDiscountCodesForEdition } from '@/lib/events/discounts/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { guardProFeaturePage } from '@/lib/pro-features/server/guard';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { CouponsManager } from './coupons-manager';
import { EventPageIntro } from '../_event-page-intro';

type CouponsPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata({ params }: CouponsPageProps): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    return {
      title: 'Coupons | RunGoMX',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Coupons - ${event.seriesName} ${event.editionLabel} | RunGoMX`,
    robots: { index: false, follow: false },
  };
}

export default async function EventCouponsPage({ params }: CouponsPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/coupons' });
  const t = await getTranslations('pages.dashboardEvents.coupons');
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

  // Check if user can access this event's series
  const canAccess = await canUserAccessSeries(authContext.user!.id, event.seriesId);
  if (!canAccess) {
    redirect(getPathname({ href: '/dashboard/events', locale }));
  }

  const gate = await guardProFeaturePage('coupons', authContext);
  if (!gate.allowed) {
    return (
      <div className="space-y-6">
        <EventPageIntro
          title={t('title')}
          description={t('description')}
          eventName={`${event.seriesName} ${event.editionLabel}`}
          organizationName={event.organizationName}
          eyebrow={t('title')}
        />
        <div className="max-w-2xl">{gate.disabled ?? gate.upsell}</div>
      </div>
    );
  }

  // Get discount codes for this edition
  const discountCodes = await getDiscountCodesForEdition(eventId);

  return (
    <div className="space-y-6">
      <EventPageIntro
        title={t('title')}
        description={t('description')}
        eventName={`${event.seriesName} ${event.editionLabel}`}
        organizationName={event.organizationName}
        eyebrow={t('title')}
      />

      <div className="w-full">
        <CouponsManager editionId={eventId} initialCoupons={discountCodes} />
      </div>
    </div>
  );
}
