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
import { InsetSurface, Surface } from '@/components/ui/surface';
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

export default async function DashboardEventsPage({
  params,
  searchParams,
}: DashboardEventsPageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  await configPageLocale(params, { pathname: '/dashboard/events' });
  const t = await getTranslations('pages.dashboardEvents');
  const authContext = await getAuthContext();

  // Access gate: organizers and internal staff only.
  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard || authContext.permissions.canManageEvents;
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
    new Map(events.map((event) => [event.organizationId, event.organizationName])).entries(),
  ).map(([id, name]) => ({ id, name }));

  return (
    <div className="space-y-6">
      <Surface className="overflow-hidden border-border/60 p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="min-w-0 space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              {t('description')}
            </p>
            <Button asChild className="w-full min-w-0 sm:w-auto">
              <Link href="/dashboard/events/new">
                <Plus className="h-4 w-4" />
                {t('createEvent.button')}
              </Link>
            </Button>
          </div>

          <InsetSurface className="border-border/60 p-5">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t('filters.title')}
              </p>
              <p className="text-2xl font-semibold tracking-tight">{filteredEvents.length}</p>
              <p className="text-sm text-muted-foreground">
                {t('filters.summary', { filtered: filteredEvents.length, total: events.length })}
              </p>
            </div>
          </InsetSurface>
        </div>
      </Surface>

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
