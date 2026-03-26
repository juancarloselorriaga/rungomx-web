import { PublicLoginRequiredShell } from '@/components/auth/public-login-required-shell';
import { getPathname } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';

type GroupLoginRequiredProps = {
  locale: string;
  eventName: string;
  callbackPathOverride: string;
};

export async function GroupLoginRequired({
  locale,
  eventName,
  callbackPathOverride,
}: GroupLoginRequiredProps) {
  const t = await getTranslations({
    locale: locale as 'es' | 'en',
    namespace: 'pages.groupLink.loginRequired',
  });

  const signInPath = getPathname({ href: '/sign-in', locale: locale as 'es' | 'en' });
  const signUpPath = getPathname({ href: '/sign-up', locale: locale as 'es' | 'en' });

  const signInUrl = `${signInPath}?callbackURL=${encodeURIComponent(callbackPathOverride)}`;
  const signUpUrl = `${signUpPath}?callbackURL=${encodeURIComponent(callbackPathOverride)}`;

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
