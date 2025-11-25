import 'server-only';
import { hasLocale } from 'next-intl';
import { headers } from 'next/headers';

import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { getRequestPathname, loadRouteMessages, loadMessages } from './utils';

export default getRequestConfig(async ({ requestLocale }) => {

  // This typically corresponds to the `[locale]` segment
  const locale = await requestLocale;

  // Ensure that the incoming locale is valid
  const resolvedLocale = (hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale) as (typeof routing.locales)[number];

  const headersList = await headers();
  const headerPath =
    headersList.get('x-pathname') ||
    headersList.get('x-matched-path') ||
    undefined;
  const pathname = headerPath ?? (await getRequestPathname());

  const messages = headerPath
    ? await loadRouteMessages(resolvedLocale, pathname)
    : await loadMessages(resolvedLocale);

  return {
    locale: resolvedLocale,
    messages,
  };
});
