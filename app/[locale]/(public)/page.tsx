import { createPageMetadata } from '@/utils/metadata';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return createPageMetadata(
    locale,
    (messages) => messages.Pages?.Home?.metadata,
    { imagePath: '/og-home.jpg' }
  );
}

export default async function Home({ params }: Props) {
  const { locale } = await params;

  // Enable static rendering
  setRequestLocale(locale);

  const t = await getTranslations('Pages.Home.content');

  return (
    <div className="w-full flex items-center justify-center">
      <p>{t('placeholder')}</p>
    </div>
  );
}
