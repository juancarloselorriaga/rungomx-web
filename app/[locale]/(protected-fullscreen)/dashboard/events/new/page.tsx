import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getProEntitlementForUser } from '@/lib/billing/entitlements';
import { getUserOrganizations } from '@/lib/organizations/queries';
import { getOrganizationEventSeries } from '@/lib/events/queries';
import { evaluateProFeatureDecision } from '@/lib/pro-features/evaluator';
import { getProFeatureConfigSnapshot } from '@/lib/pro-features/server/config';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { DashboardPageIntro, DashboardPageIntroMeta } from '@/components/dashboard/page-intro';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { CreateEventForm } from './create-event-form';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/events/new',
    (messages) => messages.Pages?.DashboardEvents?.metadata,
    { robots: { index: false, follow: false } },
  );
}

export default async function CreateEventPage({ params }: LocalePageProps) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/new' });
  const t = await getTranslations('pages.dashboardEvents');
  const authContext = await getAuthContext();

  // Access gate: organizers and internal staff only.
  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard || authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  // Get user's organizations with their series
  const organizations = await getUserOrganizations(authContext.user!.id);
  const organizationsWithSeries = await Promise.all(
    organizations.map(async (org) => {
      const series = await getOrganizationEventSeries(org.id);
      return { ...org, series };
    }),
  );
  const [proFeatureConfigs, entitlement] = await Promise.all([
    getProFeatureConfigSnapshot(),
    authContext.isInternal
      ? Promise.resolve({ isPro: false })
      : getProEntitlementForUser({
          userId: authContext.user!.id,
          isInternal: authContext.isInternal,
        }),
  ]);
  const canSeedAiContext =
    evaluateProFeatureDecision({
      featureKey: 'event_ai_wizard',
      config: proFeatureConfigs.event_ai_wizard,
      isPro: entitlement.isPro ?? false,
      isInternal: authContext.isInternal,
    }).status === 'enabled';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <DashboardPageIntro
        title={t('createEvent.title')}
        description={t('createEvent.description')}
        aside={
          <DashboardPageIntroMeta
            title={
              <ol className="space-y-3 text-sm">
                <li className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    1
                  </span>
                  <span className="font-medium">{t('createEvent.steps.organization')}</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    2
                  </span>
                  <span className="text-muted-foreground">{t('createEvent.steps.event')}</span>
                </li>
              </ol>
            }
          />
        }
      />

      <CreateEventForm
        organizations={organizationsWithSeries}
        showAiContextDisclosure={canSeedAiContext}
      />
    </div>
  );
}
