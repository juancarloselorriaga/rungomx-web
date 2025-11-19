import { siteUrl } from '@/config/url';
import { AppLocale } from '@/i18n/routing';
import { getStaticTranslation } from '@/utils/staticMessages';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

type HomeMetadataMessages = {
  title: string;
  description: string;
  keywords: string[];
  openGraph: {
    title: string;
    description: string;
    imageAlt: string;
  };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const localeKey = locale as AppLocale;
  const metadataMessages = getStaticTranslation<HomeMetadataMessages>(
    localeKey,
    'Pages.Home.metadata'
  );

  if (!metadataMessages) {
    return {};
  }

  return {
    title: metadataMessages.title,
    description: metadataMessages.description,
    keywords: metadataMessages.keywords ?? [],
    openGraph: {
      title: metadataMessages.openGraph.title,
      description: metadataMessages.openGraph.description,
      url: siteUrl,
      images: [
        {
          url: `${siteUrl}/og-home.jpg`,
          width: 1200,
          height: 630,
          alt: metadataMessages.openGraph.imageAlt,
        },
      ],
    },
  };
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
