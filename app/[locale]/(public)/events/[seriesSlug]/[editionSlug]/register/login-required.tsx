import { PublicLoginRequiredShell } from '@/components/auth/public-login-required-shell';
import { getPathname } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';

type LoginRequiredProps = {
  locale: string;
  seriesSlug: string;
  editionSlug: string;
  eventName: string;
  /** Override the default callback path (e.g. to return to a specific registration page) */
  callbackPathOverride?: string;
};

export async function LoginRequired({
  locale,
  seriesSlug,
  editionSlug,
  eventName,
  callbackPathOverride,
}: LoginRequiredProps) {
  const t = await getTranslations({
    locale: locale as 'es' | 'en',
    namespace: 'pages.events.register.loginRequired',
  });

  // Create callback URL for redirect after login
  // Build the localized path for the register page
  const registerPath = callbackPathOverride ?? getPathname({
    href: {
      pathname: '/events/[seriesSlug]/[editionSlug]/register',
      params: { seriesSlug, editionSlug },
    },
    locale: locale as 'es' | 'en',
  });

  const signInPath = getPathname({ href: '/sign-in', locale: locale as 'es' | 'en' });
  const signUpPath = getPathname({ href: '/sign-up', locale: locale as 'es' | 'en' });

  const signInUrl = `${signInPath}?callbackURL=${encodeURIComponent(registerPath)}`;
  const signUpUrl = `${signUpPath}?callbackURL=${encodeURIComponent(registerPath)}`;

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
