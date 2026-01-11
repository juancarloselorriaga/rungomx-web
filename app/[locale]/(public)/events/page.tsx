import { searchPublicEvents } from '@/lib/events/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { EventsDirectory } from './events-directory';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/events',
    (messages) => messages.Pages?.Events?.metadata,
  );
}

export default async function EventsPage({ params }: LocalePageProps) {
  const { locale } = await configPageLocale(params, { pathname: '/events' });

  const t = await getTranslations({
    locale,
    namespace: 'pages.events',
  });

  // Fetch initial events directly from DB (avoid self-HTTP call)
  const { events: dbEvents, pagination } = await searchPublicEvents({ limit: 12 });

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
