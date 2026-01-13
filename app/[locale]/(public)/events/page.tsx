import { searchPublicEvents } from '@/lib/events/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';

import { EventsDirectory } from './events-directory';
import {
  EVENTS_PAGE_LIMIT,
  parseDateParam,
  parseEventsSearchParams,
} from './search-params';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/events',
    (messages) => messages.Pages?.Events?.metadata,
  );
}

type EventsPageProps = LocalePageProps & {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EventsPage({ params, searchParams }: EventsPageProps) {
  // Opt out of static prerendering - this page uses current date for filtering
  await connection();

  const { locale } = await configPageLocale(params, { pathname: '/events' });

  const t = await getTranslations({
    locale,
    namespace: 'pages.events',
  });

  const resolvedSearchParams = await searchParams;
  const parsedParams = parseEventsSearchParams(resolvedSearchParams);
  const dateFrom = parseDateParam(parsedParams.dateFrom);
  const dateTo = parseDateParam(parsedParams.dateTo);
  const page = parsedParams.page ?? 1;
  const limit = EVENTS_PAGE_LIMIT;

  // Fetch initial events directly from DB (avoid self-HTTP call)
  const { events: dbEvents, pagination } = await searchPublicEvents({
    ...parsedParams,
    dateFrom,
    dateTo,
    page,
    limit,
  });

  // Serialize dates to strings for client component (matches API format)
  const events = dbEvents.map((event) => ({
    ...event,
    startsAt: event.startsAt?.toISOString() ?? null,
    endsAt: event.endsAt?.toISOString() ?? null,
  }));

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <EventsDirectory
        initialEvents={events}
        initialPagination={pagination}
        locale={locale}
      />
    </div>
  );
}
