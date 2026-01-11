import { getAuthContext } from '@/lib/auth/server';
import { getPublicEventBySlug } from '@/lib/events/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { RegistrationFlow } from './registration-flow';
import { LoginRequired } from './login-required';

type RegisterPageProps = LocalePageProps & {
  params: Promise<{ locale: string; seriesSlug: string; editionSlug: string }>;
};

export async function generateMetadata({ params }: RegisterPageProps): Promise<Metadata> {
  const { seriesSlug, editionSlug, locale } = await params;
  const event = await getPublicEventBySlug(seriesSlug, editionSlug);
  const t = await getTranslations({ locale: locale as 'es' | 'en', namespace: 'pages.events.register' });

  if (!event) {
    return {
      title: 'Registration | RunGoMX',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${t('title')} - ${event.seriesName} ${event.editionLabel} | RunGoMX`,
    robots: { index: false, follow: false },
  };
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  const { locale, seriesSlug, editionSlug } = await params;
  await configPageLocale(params, { pathname: '/events/[seriesSlug]/[editionSlug]/register' });

  const event = await getPublicEventBySlug(seriesSlug, editionSlug);

  if (!event) {
    notFound();
  }

  // Check if user is logged in
  const authContext = await getAuthContext();
  const isLoggedIn = !!authContext.user;

  if (!isLoggedIn) {
    return (
      <LoginRequired
        locale={locale}
        seriesSlug={seriesSlug}
        editionSlug={editionSlug}
        eventName={`${event.seriesName} ${event.editionLabel}`}
      />
    );
  }

  // Get user profile data to pre-fill form
  const userProfile = {
    firstName: authContext.user!.name?.split(' ')[0] || '',
    lastName: authContext.user!.name?.split(' ').slice(1).join(' ') || '',
    email: authContext.user!.email || '',
  };

  return (
    <RegistrationFlow
      locale={locale}
      event={event}
      seriesSlug={seriesSlug}
      editionSlug={editionSlug}
      userProfile={userProfile}
      userId={authContext.user!.id}
    />
  );
}
