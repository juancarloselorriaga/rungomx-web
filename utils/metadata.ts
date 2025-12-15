import { siteUrl } from '@/config/url';
import { Metadata } from 'next';
import {
  getMetadataMessages,
  NotFoundMessages,
  PageMetaMessages,
  PartialMetadataMessages,
  SeoDefaultMessages,
} from './staticMessages';

export type PageMetaSelector = (messages: PartialMetadataMessages) => PageMetaMessages | undefined;
type DefaultMetaSelector = (messages: PartialMetadataMessages) => SeoDefaultMessages | undefined;
type NotFoundSelector = (messages: PartialMetadataMessages) => NotFoundMessages | undefined;

type PageMetadataOptions = {
  url?: string;
  imagePath?: string;
  alternates?: Metadata['alternates'];
  robots?: Metadata['robots'];
  localeOverride?: string;
};

const DEFAULT_OG_IMAGE_PATH = '/og-image.jpg';
const OG_IMAGE_DIMENSIONS = { width: 1200, height: 630 };
const NO_INDEX_ROBOTS: Metadata['robots'] = {
  index: false,
  follow: false,
};

function resolveMessages<T>(
  locale: string,
  select: (messages: PartialMetadataMessages) => T | undefined,
): T | undefined {
  return select(getMetadataMessages(locale));
}

function buildAbsoluteUrl(path?: string): string {
  const base = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
  const normalizedPath = (path ?? DEFAULT_OG_IMAGE_PATH).startsWith('/')
    ? (path ?? DEFAULT_OG_IMAGE_PATH)
    : `/${path}`;

  return `${base}${normalizedPath}`;
}

function buildOgImages(imageAlt?: string, imagePath?: string) {
  if (!imageAlt) return undefined;

  return [
    {
      url: buildAbsoluteUrl(imagePath),
      alt: imageAlt,
      ...OG_IMAGE_DIMENSIONS,
    },
  ];
}

function sanitizeKeywords(keywords?: (string | null | undefined)[]) {
  if (!keywords) return undefined;
  const filtered = keywords.filter((k): k is string => Boolean(k));
  return filtered.length ? filtered : undefined;
}

export function createPageMetadata(
  locale: string,
  select: PageMetaSelector,
  { url, imagePath, alternates, robots, localeOverride }: PageMetadataOptions = {},
): Metadata {
  const pageMeta = resolveMessages(locale, select);
  if (!pageMeta) return {};

  const baseUrl = url ?? siteUrl;

  return {
    ...(pageMeta.title && { title: pageMeta.title }),
    ...(pageMeta.description && { description: pageMeta.description }),
    ...(sanitizeKeywords(pageMeta.keywords) && {
      keywords: sanitizeKeywords(pageMeta.keywords),
    }),
    ...(pageMeta.openGraph && {
      openGraph: {
        title: pageMeta.openGraph.title,
        description: pageMeta.openGraph.description,
        url: baseUrl,
        images: buildOgImages(pageMeta.openGraph.imageAlt, imagePath),
        ...(localeOverride && { locale: localeOverride }),
      },
    }),
    ...(alternates && { alternates }),
    ...(robots && { robots }),
  };
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
  }: PageMetadataOptions & { localeOverride?: string } = {},
): Metadata {
  const meta = resolveMessages(locale, select);
  if (!meta) return {};
  const ogImageUrl = buildAbsoluteUrl(imagePath);
  const baseUrl = url ?? siteUrl;

  return {
    metadataBase: new URL(siteUrl),
    alternates: alternates ?? { canonical: baseUrl },
    robots:
      robots ??
      ({
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          'max-snippet': -1,
          'max-image-preview': 'large',
          'max-video-preview': -1,
        },
      } satisfies NonNullable<Metadata['robots']>),
    ...(meta.title && { title: meta.title }),
    ...(meta.description && { description: meta.description }),
    ...(meta.openGraph && {
      openGraph: {
        type: 'website',
        locale: localeOverride ?? 'en_US',
        url: baseUrl,
        siteName: meta.title,
        title: meta.openGraph.title,
        description: meta.openGraph.description,
        images: buildOgImages(meta.openGraph.imageAlt, imagePath),
      },
    }),
    ...(meta.twitter && {
      twitter: {
        card: 'summary_large_image',
        title: meta.twitter.title,
        description: meta.twitter.description,
        images: [ogImageUrl],
      },
    }),
    ...(meta.applicationName && {
      other: {
        'application-name': meta.applicationName,
        'apple-mobile-web-app-title': meta.applicationName,
      },
    }),
  };
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
  return {
    ...(title && { title }),
    ...(description && { description }),
    ...(robots && { robots }),
  };
}

export function createNotFoundMetadata(locale: string, select: NotFoundSelector): Metadata {
  const messages = resolveMessages(locale, select);
  if (!messages) return createBasicMetadata({ robots: NO_INDEX_ROBOTS });

  const titleText =
    messages.code || messages.title
      ? `${messages.code ?? ''}${messages.code && messages.title ? ' - ' : ''}${messages.title ?? ''}`
      : undefined;

  return createBasicMetadata({
    title: titleText,
    description: messages.description,
    robots: NO_INDEX_ROBOTS,
  });
}
