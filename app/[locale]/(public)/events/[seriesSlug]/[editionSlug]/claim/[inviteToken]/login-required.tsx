import { PublicLoginRequiredShell } from '@/components/auth/public-login-required-shell';
import { getPathname } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';

type LoginRequiredProps = {
  locale: string;
  seriesSlug: string;
  editionSlug: string;
  inviteToken: string;
  eventName: string;
};

export async function ClaimLoginRequired({
  locale,
  seriesSlug,
  editionSlug,
  inviteToken,
  eventName,
}: LoginRequiredProps) {
  const t = await getTranslations({
    locale: locale as 'es' | 'en',
    namespace: 'pages.events.claim.loginRequired',
  });

  const claimPath = getPathname({
    href: {
      pathname: '/events/[seriesSlug]/[editionSlug]/claim/[inviteToken]',
      params: { seriesSlug, editionSlug, inviteToken },
    },
    locale: locale as 'es' | 'en',
  });

  const signInPath = getPathname({ href: '/sign-in', locale: locale as 'es' | 'en' });
  const signUpPath = getPathname({ href: '/sign-up', locale: locale as 'es' | 'en' });

  const signInUrl = `${signInPath}?callbackURL=${encodeURIComponent(claimPath)}`;
  const signUpUrl = `${signUpPath}?callbackURL=${encodeURIComponent(claimPath)}`;

  return (
    <PublicLoginRequiredShell
      title={t('title')}
      description={t('description')}
      eventName={eventName}
      signInLabel={t('signIn')}
      signUpLabel={t('signUp')}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
    />
  );
}
