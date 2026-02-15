import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { guardProFeaturePage } from '@/lib/pro-features/server/guard';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { EventSettingsForm } from './event-settings-form';
import { EventAiWizardPanel } from './event-ai-wizard-panel';

type SettingsPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: SettingsPageProps): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    return {
      title: 'Settings | RunGoMX',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Settings - ${event.seriesName} ${event.editionLabel} | RunGoMX`,
    robots: { index: false, follow: false },
  };
}

export default async function EventSettingsPage({ params, searchParams }: SettingsPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/settings' });
  const t = await getTranslations('pages.dashboardEventSettings');
  const authContext = await getAuthContext();
  const resolvedSearchParams = await searchParams;
  const wizardMode = resolvedSearchParams?.wizard === '1';

  // Access gate: organizers and internal staff only.
  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard ||
    authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  // Get event details
  const event = await getEventEditionDetail(eventId);
  if (!event) {
    notFound();
  }

  // Check if user can access this event's series
  const canAccess = await canUserAccessSeries(authContext.user!.id, event.seriesId);
  if (!canAccess) {
    redirect(getPathname({ href: '/dashboard/events', locale }));
  }

  const assistantGate = wizardMode
    ? await guardProFeaturePage('event_ai_wizard', authContext)
    : null;
  const showAssistantColumn =
    !!assistantGate &&
    (assistantGate.allowed || assistantGate.decision.status !== 'hidden');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-2">{t('title')}</h2>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {wizardMode && showAssistantColumn ? (
        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="self-start lg:sticky lg:top-6">
            {assistantGate.allowed ? (
              <EventAiWizardPanel editionId={eventId} />
            ) : (
              <div className="max-w-md">{assistantGate.disabled ?? assistantGate.upsell}</div>
            )}
          </div>
          <div className="max-w-4xl">
            <EventSettingsForm event={event} wizardMode={wizardMode} />
          </div>
        </div>
      ) : (
        <div className="max-w-4xl">
          <EventSettingsForm event={event} wizardMode={wizardMode} />
        </div>
      )}
    </div>
  );
}
