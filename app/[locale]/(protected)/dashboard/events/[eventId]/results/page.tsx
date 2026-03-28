import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ResultsHomeWorkspace } from './_results-home-workspace';
import { ResultsPageHero } from './_results-page-hero';
import { getResultsWorkspacePageData } from './_results-workspace';

type ResultsWorkspacePageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Results workspace | RunGoMX',
    robots: { index: false, follow: false },
  };
}

export default async function ResultsWorkspacePage({ params }: ResultsWorkspacePageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/results' });
  const t = await getTranslations('pages.dashboardEvents.resultsWorkspace');
  const tUnsafe = (key: string) => t(key as never);

  const pageData = await getResultsWorkspacePageData(eventId, locale, 'review');
  const stats = [
    {
      label: t('stateRail.lifecycle'),
      value:
        pageData.railState.lifecycle === 'official'
          ? t('stateRail.lifecycleOfficial')
          : t('stateRail.lifecycleDraft'),
    },
    {
      label: t('stateRail.connectivity'),
      value:
        pageData.railState.connectivity === 'online'
          ? t('stateRail.connectivityOnline')
          : t('stateRail.connectivityOffline'),
    },
    {
      label: t('stateRail.unsyncedCount'),
      value: String(pageData.railState.unsyncedCount),
    },
    {
      label: t('versionVisibility.title'),
      value: String(pageData.versionVisibility.items.length),
    },
  ] as const;

  return (
    <div className="space-y-6">
      <ResultsPageHero
        eyebrow={tUnsafe('home.eyebrow')}
        title={t('title')}
        description={t('description')}
        stats={stats}
      />

      <ResultsHomeWorkspace
        eventId={eventId}
        pageData={pageData}
        labels={{
          nextStepEyebrow: tUnsafe('home.nextStep.eyebrow'),
          nextStepTitle: tUnsafe('home.nextStep.title'),
          nextStepDescriptions: {
            syncPending: tUnsafe('home.nextStep.descriptions.syncPending'),
            reviewDraft: tUnsafe('home.nextStep.descriptions.reviewDraft'),
            readyToPublish: tUnsafe('home.nextStep.descriptions.readyToPublish'),
            startIngestion: tUnsafe('home.nextStep.descriptions.startIngestion'),
          },
          draftSources: {
            title: tUnsafe('home.draftSources.title'),
            description: tUnsafe('home.draftSources.description'),
            captureTitle: tUnsafe('home.draftSources.captureTitle'),
            captureDescription: tUnsafe('home.draftSources.captureDescription'),
            importTitle: tUnsafe('home.draftSources.importTitle'),
            importDescription: tUnsafe('home.draftSources.importDescription'),
          },
          publishReadiness: {
            title: tUnsafe('home.publishReadiness.title'),
            description: tUnsafe('home.publishReadiness.description'),
          },
          draftSnapshot: {
            title: tUnsafe('home.draftSnapshot.title'),
            description: tUnsafe('home.draftSnapshot.description'),
          },
          supportingOps: {
            title: tUnsafe('home.supportingOps.title'),
            description: tUnsafe('home.supportingOps.description'),
            correctionsTitle: tUnsafe('home.supportingOps.correctionsTitle'),
            correctionsDescription: tUnsafe('home.supportingOps.correctionsDescription'),
            investigationTitle: tUnsafe('home.supportingOps.investigationTitle'),
            investigationDescription: tUnsafe('home.supportingOps.investigationDescription'),
          },
          actions: {
            capture: t('lanes.capture.action'),
            import: t('lanes.import.action'),
            corrections: t('lanes.corrections.action'),
            investigation: t('lanes.investigation.action'),
          },
        }}
      />
    </div>
  );
}
