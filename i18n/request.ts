import 'server-only';
import { hasLocale } from 'next-intl';

import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { loadMessages } from './utils';

export default getRequestConfig(async ({ requestLocale }) => {

  // This typically corresponds to the `[locale]` segment
  const locale = await requestLocale;

  // Ensure that the incoming locale is valid
  const resolvedLocale = (hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale) as (typeof routing.locales)[number];

  return {
    locale: resolvedLocale,
    messages: await loadMessages(resolvedLocale),
  };
});
