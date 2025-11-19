import { AppLocale } from '@/i18n/routing';
import enMessages from '@/messages/en.json';
import esMessages from '@/messages/es.json';

type Messages = typeof esMessages;

const messagesByLocale: Record<AppLocale, Messages> = {
  es: esMessages,
  en: enMessages,
};

/**
 * Return statically importable translations for a given locale.
 * Falls back to Spanish to keep metadata generation stable even if an unknown locale is passed.
 */
export function getStaticMessages(locale: string): Messages {
  if (locale in messagesByLocale) {
    return messagesByLocale[locale as AppLocale];
  }

  return esMessages;
}

/**
 * Resolve a nested translation path (e.g. "SEO.default.title") from the static messages object.
 */
export function getStaticTranslation<T>(locale: string, path: string): T | undefined {
  const segments = path.split('.');
  let current: any = getStaticMessages(locale);

  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }

  return current as T | undefined;
}
