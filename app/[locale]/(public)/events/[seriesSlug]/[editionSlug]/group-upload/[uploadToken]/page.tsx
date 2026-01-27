import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getUploadLinkContext } from '@/lib/events/group-upload/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { GroupUploadLanding } from './group-upload-landing';

type GroupUploadPageProps = LocalePageProps & {
  params: Promise<{ locale: string; seriesSlug: string; editionSlug: string; uploadToken: string }>;
};

export async function generateMetadata({ params }: GroupUploadPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.events.groupUpload' });

  return {
    title: t('title'),
    robots: { index: false, follow: false },
  } as const;
}

export default async function GroupUploadLandingPage({ params }: GroupUploadPageProps) {
  const { locale, seriesSlug, editionSlug, uploadToken } = await params;
  await configPageLocale(params, {
    pathname: '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]',
  });

  const [authContext, linkContext] = await Promise.all([
    getAuthContext(),
    getUploadLinkContext({ token: uploadToken }),
  ]);

  if (!linkContext.link || !linkContext.event) {
    notFound();
  }

  if (
    linkContext.event.seriesSlug !== seriesSlug ||
    linkContext.event.editionSlug !== editionSlug
  ) {
    const redirectPath = getPathname({
      href: {
        pathname: '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]',
        params: {
          seriesSlug: linkContext.event.seriesSlug,
          editionSlug: linkContext.event.editionSlug,
          uploadToken,
        },
      },
      locale,
    });
    redirect(redirectPath);
  }

  const groupUploadPath = getPathname({
    href: {
      pathname: '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]',
      params: { seriesSlug, editionSlug, uploadToken },
    },
    locale,
  });

  const callbackPath = groupUploadPath.startsWith(`/${locale}/`)
    ? groupUploadPath.slice(locale.length + 1)
    : groupUploadPath;

  const signInUrl = authContext.user
    ? undefined
    : `${getPathname({ href: '/sign-in', locale })}?callbackURL=${encodeURIComponent(callbackPath)}`;

  const signUpUrl = authContext.user
    ? undefined
    : `${getPathname({ href: '/sign-up', locale })}?callbackURL=${encodeURIComponent(callbackPath)}`;

  return (
    <GroupUploadLanding
      uploadToken={uploadToken}
      status={linkContext.status}
      isAuthenticated={Boolean(authContext.user)}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      event={{
        ...linkContext.event,
        startsAt: linkContext.event.startsAt ? linkContext.event.startsAt.toISOString() : null,
        endsAt: linkContext.event.endsAt ? linkContext.event.endsAt.toISOString() : null,
      }}
      distances={linkContext.distances}
      usage={linkContext.usage}
    />
  );
}
