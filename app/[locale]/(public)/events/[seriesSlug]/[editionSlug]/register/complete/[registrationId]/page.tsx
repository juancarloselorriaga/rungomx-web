import { and, eq, isNull } from 'drizzle-orm';

import { getPathname } from '@/i18n/navigation';
import { db } from '@/db';
import { eventEditions } from '@/db/schema';
import { getAuthContextWithOrgs } from '@/lib/auth/server';
import { getPublicEventBySlug } from '@/lib/events/queries';
import { getAddOnsForEdition } from '@/lib/events/add-ons/queries';
import { getQuestionsForEdition } from '@/lib/events/questions/queries';
import { getEventDocuments } from '@/lib/events/website/queries';
import { getRegistrationForOwnerOrThrow, RegistrationOwnershipError } from '@/lib/events/registrations/ownership';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { RegistrationFlow } from '../../registration-flow';
import { LoginRequired } from '../../login-required';

type RegisterCompletePageProps = LocalePageProps & {
  params: Promise<{ locale: string; seriesSlug: string; editionSlug: string; registrationId: string }>;
};

export async function generateMetadata({ params }: RegisterCompletePageProps): Promise<Metadata> {
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

export default async function RegisterCompletePage({ params }: RegisterCompletePageProps) {
  const { locale, seriesSlug, editionSlug, registrationId } = await params;
  await configPageLocale(params, { pathname: '/events/[seriesSlug]/[editionSlug]/register/complete/[registrationId]' });

  const authContext = await getAuthContextWithOrgs();
  const event = await getPublicEventBySlug(seriesSlug, editionSlug);

  if (!event) {
    notFound();
  }

  if (!authContext.user) {
    const completePath = getPathname({
      href: {
        pathname: '/events/[seriesSlug]/[editionSlug]/register/complete/[registrationId]',
        params: { seriesSlug, editionSlug, registrationId },
      },
      locale: locale as 'es' | 'en',
    });

    return (
      <LoginRequired
        locale={locale}
        seriesSlug={seriesSlug}
        editionSlug={editionSlug}
        eventName={`${event.seriesName} ${event.editionLabel}`}
        callbackPathOverride={completePath}
      />
    );
  }

  let registration;
  try {
    registration = await getRegistrationForOwnerOrThrow({
      registrationId,
      userId: authContext.user.id,
    });
  } catch (error) {
    if (error instanceof RegistrationOwnershipError) {
      notFound();
    }
    throw error;
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, registration.editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    notFound();
  }

  if (edition.series.slug !== seriesSlug || edition.slug !== editionSlug) {
    const redirectPath = getPathname({
      href: {
        pathname: '/events/[seriesSlug]/[editionSlug]/register/complete/[registrationId]',
        params: {
          seriesSlug: edition.series.slug,
          editionSlug: edition.slug,
          registrationId,
        },
      },
      locale,
    });
    redirect(redirectPath);
  }

  const [questions, addOns, documents] = await Promise.all([
    getQuestionsForEdition(event.id),
    getAddOnsForEdition(event.id),
    getEventDocuments(event.id, locale),
  ]);

  const userProfile = {
    firstName: authContext.user.name?.split(' ')[0] || '',
    lastName: authContext.user.name?.split(' ').slice(1).join(' ') || '',
    email: authContext.user.email || '',
    phone: authContext.profile?.phone || '',
    dateOfBirth: authContext.profile?.dateOfBirth
      ? new Date(authContext.profile.dateOfBirth).toISOString().split('T')[0]
      : '',
    gender: authContext.profile?.gender || '',
    emergencyContactName: authContext.profile?.emergencyContactName || '',
    emergencyContactPhone: authContext.profile?.emergencyContactPhone || '',
  };

  const isOrganizerForEvent = Boolean(
    authContext.organizationMemberships?.some(
      (membership) => membership.organizationId === event.organizationId,
    ),
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
      userId={authContext.user.id}
      showOrganizerSelfRegistrationWarning={isOrganizerForEvent}
      resumeRegistrationId={registration.id}
      resumeDistanceId={registration.distanceId}
      resumePricing={{
        basePriceCents: registration.basePriceCents ?? null,
        feesCents: registration.feesCents ?? null,
        taxCents: registration.taxCents ?? null,
        totalCents: registration.totalCents ?? null,
      }}
    />
  );
}
