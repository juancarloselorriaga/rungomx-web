import { PublicLoginRequiredShell } from '@/components/auth/public-login-required-shell';
import { getPathname } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';

type LoginRequiredProps = {
  locale: string;
  seriesSlug: string;
  editionSlug: string;
  uploadToken: string;
  eventName: string;
};

export async function GroupUploadLoginRequired({
  locale,
  seriesSlug,
  editionSlug,
  uploadToken,
  eventName,
}: LoginRequiredProps) {
  const t = await getTranslations({
    locale: locale as 'es' | 'en',
    namespace: 'pages.events.groupUpload.loginRequired',
  });

  const groupUploadPath = getPathname({
    href: {
      pathname: '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]',
      params: { seriesSlug, editionSlug, uploadToken },
    },
    locale: locale as 'es' | 'en',
  });

  const signInPath = getPathname({ href: '/sign-in', locale: locale as 'es' | 'en' });
  const signUpPath = getPathname({ href: '/sign-up', locale: locale as 'es' | 'en' });

  const signInUrl = `${signInPath}?callbackURL=${encodeURIComponent(groupUploadPath)}`;
  const signUpUrl = `${signUpPath}?callbackURL=${encodeURIComponent(groupUploadPath)}`;

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
