import { AppLocale } from '@/i18n/routing';
import enMetadata from '@/messages/metadata/en.json';
import esMetadata from '@/messages/metadata/es.json';

export type MetadataMessages = typeof esMetadata;
export type PartialDeep<T> = {
  [K in keyof T]?: T[K] extends Record<string, any>
    ? PartialDeep<T[K]>
    : T[K];
};
export type PartialMetadataMessages = PartialDeep<MetadataMessages>;
export type SeoDefaultMessages = PartialDeep<MetadataMessages['SEO']['default']>;
export type PageMetaMessages =
  PartialDeep<MetadataMessages['Pages'][keyof MetadataMessages['Pages']]['metadata']>;
export type NotFoundMessages =
  PartialDeep<MetadataMessages['Components']['ErrorBoundary']['notFound']>;
export type OpenGraphMeta = PageMetaMessages['openGraph'];

const metadataByLocale: Record<AppLocale, MetadataMessages> = {
  es: esMetadata,
  en: enMetadata,
};

function resolveLocale(locale: string): AppLocale {
  return (locale in metadataByLocale ? locale : 'es') as AppLocale;
}

/**
 * Return statically importable metadata messages for a given locale.
 * Falls back to Spanish to keep metadata generation stable even if an unknown locale is passed.
 */
export function getMetadataMessages(locale: string): MetadataMessages {
  const resolvedLocale = resolveLocale(locale);
  return metadataByLocale[resolvedLocale];
}
