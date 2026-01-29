import { getPathname, Link } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getUserEvents } from '@/lib/events/queries';
import {
  applyOrganizerEventsQuery,
  normalizeOrganizerEventsQuery,
  parseOrganizerEventsSearchParams,
} from '@/lib/events/organizer-events';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { OrganizerEventsResults } from './organizer-events-results';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/events',
    (messages) => messages.Pages?.DashboardEvents?.metadata,
    { robots: { index: false, follow: false } },
  );
}

type DashboardEventsPageProps = LocalePageProps & {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardEventsPage({ params, searchParams }: DashboardEventsPageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  await configPageLocale(params, { pathname: '/dashboard/events' });
  const t = await getTranslations('pages.dashboardEvents');
  const authContext = await getAuthContext();

  // Access gate: organizers and internal staff only.
  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard ||
    authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  // Get user's events
  const events = await getUserEvents(authContext.user!.id);
  const query = normalizeOrganizerEventsQuery(
    parseOrganizerEventsSearchParams(resolvedSearchParams),
  );
  const filteredEvents = applyOrganizerEventsQuery(events, query);
  const organizations = Array.from(
    new Map(
      events.map((event) => [event.organizationId, event.organizationName]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button asChild className="w-full min-w-0 sm:w-auto">
          <Link href="/dashboard/events/new">
            <Plus className="h-4 w-4" />
            {t('createEvent.button')}
          </Link>
        </Button>
      </div>

      <OrganizerEventsResults
        query={query}
        organizations={organizations}
        totalEvents={events.length}
        filteredEvents={filteredEvents}
        locale={locale}
      />
    </div>
  );
}
