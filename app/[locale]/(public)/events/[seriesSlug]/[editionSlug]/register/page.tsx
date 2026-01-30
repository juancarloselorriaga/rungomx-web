import { getAuthContextWithOrgs } from '@/lib/auth/server';
import { getActiveRegistrationForEdition, getPublicEventBySlug } from '@/lib/events/queries';
import { getCurrentInviteForEmail } from '@/lib/events/invite-claim/queries';
import { normalizeEmail } from '@/lib/events/shared/identity';
import { resolveEventSlugRedirect } from '@/lib/events/slug-redirects';
import { getAddOnsForEdition } from '@/lib/events/add-ons/queries';
import { getQuestionsForEdition } from '@/lib/events/questions/queries';
import { getEventDocuments } from '@/lib/events/website/queries';
import { getPathname } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';

import { RegistrationFlow } from './registration-flow';
import { LoginRequired } from './login-required';

type RegisterPageProps = LocalePageProps & {
  params: Promise<{ locale: string; seriesSlug: string; editionSlug: string }>;
  searchParams?: Promise<{ distanceId?: string; groupToken?: string }>;
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

export default async function RegisterPage({ params, searchParams }: RegisterPageProps) {
  const { locale, seriesSlug, editionSlug } = await params;
  const { distanceId: preSelectedDistanceId, groupToken } = (await searchParams) ?? {};
  await configPageLocale(params, { pathname: '/events/[seriesSlug]/[editionSlug]/register' });

  const event = await getPublicEventBySlug(seriesSlug, editionSlug);

  if (!event) {
    const redirectTarget = await resolveEventSlugRedirect(seriesSlug, editionSlug);
    if (redirectTarget) {
      permanentRedirect(
        getPathname({
          href: {
            pathname: '/events/[seriesSlug]/[editionSlug]/register',
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

  // Check if user is logged in
  const authContext = await getAuthContextWithOrgs();
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

  // Check if user already has an active registration
  const existingRegistration = await getActiveRegistrationForEdition(
    authContext.user!.id,
    event.id,
  );

  const [questions, addOns, documents, activeInvite] = await Promise.all([
    getQuestionsForEdition(event.id),
    getAddOnsForEdition(event.id),
    getEventDocuments(event.id, locale),
    authContext.user?.email
      ? getCurrentInviteForEmail({
          editionId: event.id,
          emailNormalized: normalizeEmail(authContext.user.email),
        })
      : Promise.resolve(null),
  ]);

  // Get user profile data to pre-fill form
  const userProfile = {
    firstName: authContext.user!.name?.split(' ')[0] || '',
    lastName: authContext.user!.name?.split(' ').slice(1).join(' ') || '',
    email: authContext.user!.email || '',
    phone: authContext.profile?.phone || '',
    dateOfBirth: authContext.profile?.dateOfBirth
      ? new Date(authContext.profile.dateOfBirth).toISOString().split('T')[0]
      : '',
    gender: authContext.profile?.gender || '',
    emergencyContactName: authContext.profile?.emergencyContactName || '',
    emergencyContactPhone: authContext.profile?.emergencyContactPhone || '',
  };

  const isOrganizerForEvent = Boolean(
    authContext.organizationMemberships?.some((membership) => membership.organizationId === event.organizationId),
  );

  return (
    <RegistrationFlow
      locale={locale}
      event={event}
      questions={questions}
      addOns={addOns}
      documents={documents}
      seriesSlug={seriesSlug}
      editionSlug={editionSlug}
      userProfile={userProfile}
      userId={authContext.user!.id}
      showOrganizerSelfRegistrationWarning={isOrganizerForEvent}
      preSelectedDistanceId={preSelectedDistanceId}
      groupToken={groupToken}
      existingRegistration={existingRegistration}
      activeInviteExists={Boolean(activeInvite)}
    />
  );
}
