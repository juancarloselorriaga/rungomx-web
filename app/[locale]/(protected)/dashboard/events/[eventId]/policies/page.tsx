import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { PoliciesForm } from './policies-form';

type PoliciesPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata({ params }: PoliciesPageProps): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    return {
      title: 'Policies | RunGoMX',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Policies - ${event.seriesName} ${event.editionLabel} | RunGoMX`,
    robots: { index: false, follow: false },
  };
}

export default async function PoliciesPage({ params }: PoliciesPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/policies' });
  const t = await getTranslations('pages.dashboardEvents.policies');
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-2">{t('title')}</h2>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <div className="max-w-4xl">
        <PoliciesForm
          eventId={eventId}
          initialPolicies={event.policyConfig}
        />
      </div>
    </div>
  );
}
