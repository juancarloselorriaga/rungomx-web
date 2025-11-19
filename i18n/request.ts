import 'server-only';

import { getRequestConfig } from 'next-intl/server';
import { AppLocale, routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {

  // This typically corresponds to the `[locale]` segment
  const locale = await requestLocale;

  // Ensure that the incoming locale is valid
  const resolvedLocale = locale && routing.locales.includes(locale as AppLocale)
    ? (locale as AppLocale)
    : routing.defaultLocale;

  return {
    locale: resolvedLocale,
    messages: (await import(`../messages/${resolvedLocale}.json`)).default
  };
});
