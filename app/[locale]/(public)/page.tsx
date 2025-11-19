import { siteUrl } from '@/config/url';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Pages.Home.metadata');

  return {
    title: t('title'),
    description: t('description'),
    keywords: [
      t('keywords.0'),
      t('keywords.1'),
      t('keywords.2'),
      t('keywords.3'),
      t('keywords.4'),
      t('keywords.5'),
      t('keywords.6'),
      t('keywords.7'),
    ],
    openGraph: {
      title: t('openGraph.title'),
      description: t('openGraph.description'),
      url: siteUrl,
      images: [
        {
          url: `${siteUrl}/og-home.jpg`,
          width: 1200,
          height: 630,
          alt: t('openGraph.imageAlt'),
        },
      ],
    },
  };
}

export default async function Home() {
  const t = await getTranslations('Pages.Home.content');

  return (
    <div className="w-full flex items-center justify-center">
      <p>{t('placeholder')}</p>
    </div>
  );
}
