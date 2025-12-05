import 'server-only';
import { hasLocale } from 'next-intl';

import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_TIMEZONE, routing } from './routing';
import {
  getRequestPathname,
  getStoredRoutePathname,
  loadMessages,
  loadRouteMessages,
} from './utils';

export default getRequestConfig(async ({ requestLocale }) => {

  // This typically corresponds to the `[locale]` segment
  const locale = await requestLocale;

  // Ensure that the incoming locale is valid
  const resolvedLocale = (hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale) as (typeof routing.locales)[number];

  const storedPathname = getStoredRoutePathname();
  const pathname = storedPathname ?? getRequestPathname();

  const messages = storedPathname
    ? await loadRouteMessages(resolvedLocale, pathname)
    : await loadMessages(resolvedLocale);

  return {
    locale: resolvedLocale,
    messages,
    timeZone: DEFAULT_TIMEZONE,
  };
});
