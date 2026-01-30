import { getAuthContext } from '@/lib/auth/server';
import { getPublicEventBySlug } from '@/lib/events/queries';
import { resolveEventSlugRedirect } from '@/lib/events/slug-redirects';
import { getPathname } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { getTranslations } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';

import { GroupLoginRequired } from '../login-required';
import { GroupLinkCreate } from './group-create';

type CreateGroupPageProps = LocalePageProps & {
  params: Promise<{ locale: string; seriesSlug: string; editionSlug: string }>;
};

export async function generateMetadata({ params }: CreateGroupPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.groupLink.create' });

  return {
    title: t('title'),
    robots: { index: false, follow: false },
  } as const;
}

export default async function CreateGroupPage({ params }: CreateGroupPageProps) {
  const { locale, seriesSlug, editionSlug } = await params;
  await configPageLocale(params, {
    pathname: '/events/[seriesSlug]/[editionSlug]/groups/new',
  });

  const event = await getPublicEventBySlug(seriesSlug, editionSlug);

  if (!event) {
    const redirectTarget = await resolveEventSlugRedirect(seriesSlug, editionSlug);
    if (redirectTarget) {
      permanentRedirect(
        getPathname({
          href: {
            pathname: '/events/[seriesSlug]/[editionSlug]/groups/new',
            params: {
              seriesSlug: redirectTarget.seriesSlug,
              editionSlug: redirectTarget.editionSlug,
            },
          },
          locale,
        }),
      );
    }
    notFound();
  }

  const authContext = await getAuthContext();
  const isLoggedIn = Boolean(authContext.user);

  const createPath = getPathname({
    href: {
      pathname: '/events/[seriesSlug]/[editionSlug]/groups/new',
      params: { seriesSlug, editionSlug },
    },
    locale,
  });

  if (!isLoggedIn) {
    return (
      <GroupLoginRequired
        locale={locale}
        eventName={`${event.seriesName} ${event.editionLabel}`}
        callbackPathOverride={createPath}
      />
    );
  }

  return (
    <GroupLinkCreate
      editionId={event.id}
      seriesSlug={seriesSlug}
      editionSlug={editionSlug}
      eventName={`${event.seriesName} ${event.editionLabel}`}
      distances={event.distances.map((distance) => ({
        id: distance.id,
        label: distance.label,
        spotsRemaining: distance.spotsRemaining,
      }))}
    />
  );
}
