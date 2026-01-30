import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getRegistrationGroupContext } from '@/lib/events/registration-groups/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { GroupLinkPage } from './group-page';

type GroupPageProps = LocalePageProps & {
  params: Promise<{ locale: string; seriesSlug: string; editionSlug: string; groupToken: string }>;
};

export async function generateMetadata({ params }: GroupPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.groupLink' });

  return {
    title: t('title'),
    robots: { index: false, follow: false },
  } as const;
}

export default async function GroupPage({ params }: GroupPageProps) {
  const { locale, seriesSlug, editionSlug, groupToken } = await params;
  await configPageLocale(params, {
    pathname: '/events/[seriesSlug]/[editionSlug]/groups/[groupToken]',
  });

  const authContext = await getAuthContext();
  const groupContext = await getRegistrationGroupContext({
    token: groupToken,
    userId: authContext.user?.id ?? null,
  });

  if (!groupContext.group || !groupContext.event || !groupContext.distance) {
    notFound();
  }

  if (
    groupContext.event.seriesSlug !== seriesSlug ||
    groupContext.event.editionSlug !== editionSlug
  ) {
    const redirectPath = getPathname({
      href: {
        pathname: '/events/[seriesSlug]/[editionSlug]/groups/[groupToken]',
        params: {
          seriesSlug: groupContext.event.seriesSlug,
          editionSlug: groupContext.event.editionSlug,
          groupToken,
        },
      },
      locale,
    });
    redirect(redirectPath);
  }

  const groupPath = getPathname({
    href: {
      pathname: '/events/[seriesSlug]/[editionSlug]/groups/[groupToken]',
      params: { seriesSlug, editionSlug, groupToken },
    },
    locale,
  });

  const callbackPath = groupPath.startsWith(`/${locale}/`)
    ? groupPath.slice(locale.length + 1)
    : groupPath;

  const signInUrl = authContext.user
    ? undefined
    : `${getPathname({ href: '/sign-in', locale })}?callbackURL=${encodeURIComponent(callbackPath)}`;

  const signUpUrl = authContext.user
    ? undefined
    : `${getPathname({ href: '/sign-up', locale })}?callbackURL=${encodeURIComponent(callbackPath)}`;

  return (
    <GroupLinkPage
      groupToken={groupToken}
      status={groupContext.status}
      isAuthenticated={Boolean(authContext.user)}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      event={{
        editionId: groupContext.event.editionId,
        editionSlug: groupContext.event.editionSlug,
        editionLabel: groupContext.event.editionLabel,
        seriesSlug: groupContext.event.seriesSlug,
        seriesName: groupContext.event.seriesName,
        startsAt: groupContext.event.startsAt ? groupContext.event.startsAt.toISOString() : null,
        timezone: groupContext.event.timezone,
        locationDisplay: groupContext.event.locationDisplay,
        city: groupContext.event.city,
        state: groupContext.event.state,
        isRegistrationOpen: groupContext.event.isRegistrationOpen,
        isRegistrationPaused: groupContext.event.isRegistrationPaused,
        registrationOpensAt: groupContext.event.registrationOpensAt ? groupContext.event.registrationOpensAt.toISOString() : null,
        registrationClosesAt: groupContext.event.registrationClosesAt ? groupContext.event.registrationClosesAt.toISOString() : null,
      }}
      distance={groupContext.distance}
      group={{
        ...groupContext.group,
        memberCount: groupContext.memberCount,
      }}
      viewer={groupContext.viewer}
      members={groupContext.members}
    />
  );
}
