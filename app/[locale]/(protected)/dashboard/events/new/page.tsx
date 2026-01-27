import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getUserOrganizations } from '@/lib/organizations/queries';
import { getOrganizationEventSeries } from '@/lib/events/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { CreateEventForm } from './create-event-form';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/events/new',
    (messages) => messages.Pages?.DashboardEvents?.metadata,
    { robots: { index: false, follow: false } },
  );
}

export default async function CreateEventPage({ params }: LocalePageProps) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/new' });
  const t = await getTranslations('pages.dashboardEvents');
  const authContext = await getAuthContext();

  // Access gate: organizers and internal staff only.
  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard ||
    authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  // Get user's organizations with their series
  const organizations = await getUserOrganizations(authContext.user!.id);
  const organizationsWithSeries = await Promise.all(
    organizations.map(async (org) => {
      const series = await getOrganizationEventSeries(org.id);
      return { ...org, series };
    }),
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('createEvent.title')}</h1>
        <p className="text-muted-foreground">{t('createEvent.description')}</p>
      </div>

      <CreateEventForm organizations={organizationsWithSeries} />
    </div>
  );
}
