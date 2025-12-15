import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

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

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>
    </div>
  );
}
