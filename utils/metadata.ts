import { siteUrl } from '@/config/url';
import { Metadata } from 'next';
import {
  PartialMetadataMessages,
  NotFoundMessages,
  PageMetaMessages,
  SeoDefaultMessages,
  getMetadataMessages,
} from './staticMessages';

type PageMetaSelector = (messages: PartialMetadataMessages) => PageMetaMessages | undefined;
type DefaultMetaSelector = (messages: PartialMetadataMessages) => SeoDefaultMessages | undefined;
type NotFoundSelector = (messages: PartialMetadataMessages) => NotFoundMessages | undefined;

type PageMetadataOptions = {
  url?: string;
  imagePath?: string;
  alternates?: Metadata['alternates'];
  robots?: Metadata['robots'];
};

export function createPageMetadata(
  locale: string,
  select: PageMetaSelector,
  { url, imagePath, alternates, robots }: PageMetadataOptions = {}
): Metadata {
  const pageMeta = select(getMetadataMessages(locale));
  if (!pageMeta) return {};
  const ogImageUrl = imagePath ? `${siteUrl}${imagePath}` : `${siteUrl}/og-image.jpg`;

  const metadata: Metadata = {};

  if (pageMeta.title) metadata.title = pageMeta.title;
  if (pageMeta.description) metadata.description = pageMeta.description;
  if (pageMeta.keywords) {
    const filtered = pageMeta.keywords.filter((k): k is string => Boolean(k));
    if (filtered.length) metadata.keywords = filtered;
  }

  if (pageMeta.openGraph) {
    metadata.openGraph = {
      title: pageMeta.openGraph.title,
      description: pageMeta.openGraph.description,
      url: url ?? siteUrl,
      images: pageMeta.openGraph.imageAlt
        ? [
            {
              url: ogImageUrl,
              width: 1200,
              height: 630,
              alt: pageMeta.openGraph.imageAlt,
            },
          ]
        : undefined,
    };
  }

  if (alternates) metadata.alternates = alternates;
  if (robots) metadata.robots = robots;

  return metadata;
}

export function createDefaultSeoMetadata(
  locale: string,
  select: DefaultMetaSelector,
  {
    url,
    imagePath,
    localeOverride,
    alternates,
    robots,
  }: PageMetadataOptions & { localeOverride?: string } = {}
): Metadata {
  const meta = select(getMetadataMessages(locale));
  if (!meta) return {};
  const ogImageUrl = imagePath ? `${siteUrl}${imagePath}` : `${siteUrl}/og-image.jpg`;

  const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    alternates: alternates ?? {
      canonical: url ?? siteUrl,
    },
    robots:
      robots ??
      {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          'max-snippet': -1,
          'max-image-preview': 'large',
          'max-video-preview': -1,
        },
      },
  };

  if (meta.title) metadata.title = meta.title;
  if (meta.description) metadata.description = meta.description;

  if (meta.openGraph) {
    metadata.openGraph = {
      type: 'website',
      locale: localeOverride ?? 'en_US',
      url: url ?? siteUrl,
      siteName: meta.title,
      title: meta.openGraph.title,
      description: meta.openGraph.description,
      images: meta.openGraph.imageAlt
        ? [
            {
              url: ogImageUrl,
              width: 1200,
              height: 630,
              alt: meta.openGraph.imageAlt,
            },
          ]
        : undefined,
    };
  }

  if (meta.twitter) {
    metadata.twitter = {
      card: 'summary_large_image',
      title: meta.twitter.title,
      description: meta.twitter.description,
      images: [ogImageUrl],
    };
  }

  if (meta.applicationName) {
    metadata.other = {
      'application-name': meta.applicationName,
      'apple-mobile-web-app-title': meta.applicationName,
    };
  }

  return metadata;
}

type BasicMetadataOptions = {
  title?: string;
  description?: string;
  robots?: Metadata['robots'];
};

export function createBasicMetadata({
  title,
  description,
  robots,
}: BasicMetadataOptions): Metadata {
  const metadata: Metadata = {};

  if (title) metadata.title = title;
  if (description) metadata.description = description;
  if (robots) metadata.robots = robots;

  return metadata;
}

export function createNotFoundMetadata(
  locale: string,
  select: NotFoundSelector
): Metadata {
  const messages = select(getMetadataMessages(locale));
  if (!messages) {
    return createBasicMetadata({
      robots: {
        index: false,
        follow: false,
      },
    });
  }

  const titleText =
    messages.code || messages.title
      ? `${messages.code ?? ''}${messages.code && messages.title ? ' - ' : ''}${messages.title ?? ''}`
      : undefined;

  return createBasicMetadata({
    title: titleText,
    description: messages.description,
    robots: {
      index: false,
      follow: false,
    },
  });
}
