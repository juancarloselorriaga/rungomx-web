import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getClaimPageContextByToken } from '@/lib/events/invite-claim/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { ClaimInviteCard } from './claim-card';
import { ClaimLoginRequired } from './login-required';

type ClaimPageProps = LocalePageProps & {
  params: Promise<{ locale: string; seriesSlug: string; editionSlug: string; inviteToken: string }>;
};

export async function generateMetadata({ params }: ClaimPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.events.claim' });

  return {
    title: t('title'),
    robots: { index: false, follow: false },
  } as const;
}

export default async function ClaimPage({ params }: ClaimPageProps) {
  const { locale, seriesSlug, editionSlug, inviteToken } = await params;
  await configPageLocale(params, { pathname: '/events/[seriesSlug]/[editionSlug]/claim/[inviteToken]' });

  const [authContext, claimContext] = await Promise.all([
    getAuthContext(),
    getClaimPageContextByToken({ token: inviteToken }),
  ]);

  if (!claimContext.event && claimContext.status === 'NOT_FOUND') {
    notFound();
  }

  if (
    claimContext.event &&
    (claimContext.event.seriesSlug !== seriesSlug ||
      claimContext.event.editionSlug !== editionSlug)
  ) {
    const redirectPath = getPathname({
      href: {
        pathname: '/events/[seriesSlug]/[editionSlug]/claim/[inviteToken]',
        params: {
          seriesSlug: claimContext.event.seriesSlug,
          editionSlug: claimContext.event.editionSlug,
          inviteToken,
        },
      },
      locale,
    });
    redirect(redirectPath);
  }

  const eventName = claimContext.event
    ? `${claimContext.event.seriesName} ${claimContext.event.editionLabel}`.trim()
    : '';

  if (claimContext.status !== 'ACTIVE') {
    const t = await getTranslations({ locale, namespace: 'pages.events.claim' });

    return (
      <div className="container mx-auto px-4 py-16 max-w-lg text-center space-y-4">
        <h1 className="text-2xl font-bold">{t(`status.${claimContext.status}.title`)}</h1>
        <p className="text-muted-foreground">{t(`status.${claimContext.status}.description`)}</p>
        {eventName ? <p className="text-sm text-muted-foreground">{eventName}</p> : null}
      </div>
    );
  }

  if (!authContext.user) {
    return (
      <ClaimLoginRequired
        locale={locale}
        seriesSlug={seriesSlug}
        editionSlug={editionSlug}
        inviteToken={inviteToken}
        eventName={eventName}
      />
    );
  }

  if (!authContext.user.emailVerified) {
    const claimPath = getPathname({
      href: {
        pathname: '/events/[seriesSlug]/[editionSlug]/claim/[inviteToken]',
        params: { seriesSlug, editionSlug, inviteToken },
      },
      locale,
    });

    const callbackPath = claimPath.startsWith(`/${locale}/`)
      ? claimPath.slice(locale.length + 1)
      : claimPath;

    const verifyPath = getPathname({ href: '/verify-email', locale });
    const verifyUrl = `${verifyPath}?email=${encodeURIComponent(authContext.user.email ?? '')}&callbackURL=${encodeURIComponent(callbackPath)}`;

    redirect(verifyUrl);
  }

  if (!claimContext.event) {
    notFound();
  }

  return (
    <ClaimInviteCard
      inviteToken={inviteToken}
      event={claimContext.event}
      needsDob={!authContext.profile?.dateOfBirth}
    />
  );
}
