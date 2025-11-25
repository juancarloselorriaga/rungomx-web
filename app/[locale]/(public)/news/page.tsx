import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/news',
    (messages) => messages.Pages?.News?.metadata
  );
}

export default async function NewsPage({ params }: LocalePageProps) {
  await configPageLocale(params);
  const t = await getTranslations('pages.news');

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
      <p className="text-muted-foreground">
        {t('description')}
      </p>
    </div>
  );
}
