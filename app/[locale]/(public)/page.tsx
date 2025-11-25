import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/',
    (messages) => messages.Pages?.Home?.metadata,
    { imagePath: '/og-home.jpg' }
  );
}

export default async function Home({ params }: LocalePageProps) {
  await configPageLocale(params);

  const t = await getTranslations('pages.home.content');

  return (
    <div className="w-full flex items-center justify-center">
      <p>{t('placeholder')}</p>
    </div>
  );
}
