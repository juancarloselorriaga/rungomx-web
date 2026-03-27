import { DraftReviewFinalizationGate } from '@/components/results/organizer/draft-review-finalization-gate';
import { OrganizerResultsLane } from '@/components/results/organizer/organizer-results-lane';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ResultsPageHero } from '../_results-page-hero';
import { getResultsWorkspacePageData } from '../_results-workspace';

type ResultsReviewPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Results review | RunGoMX',
    robots: { index: false, follow: false },
  };
}

export default async function ResultsReviewPage({ params }: ResultsReviewPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/results/review' });
  const t = await getTranslations('pages.dashboardEvents.resultsWorkspace.lanes.review');
  const pageData = await getResultsWorkspacePageData(eventId, locale, 'review');

  return (
    <div className="space-y-6">
      <ResultsPageHero
        title={t('title')}
        description={t('description')}
        stats={[
          {
            label: pageData.labels.reviewGate.rowCountLabel,
            value: String(pageData.reviewSummary?.rowCount ?? pageData.rows.length),
          },
          {
            label: pageData.labels.reviewGate.blockerCountLabel,
            value: String(pageData.reviewSummary?.blockerCount ?? 0),
          },
          {
            label: pageData.labels.reviewGate.warningCountLabel,
            value: String(pageData.reviewSummary?.warningCount ?? 0),
          },
        ]}
      />

      <OrganizerResultsLane
        eventId={eventId}
        densityStorageKey={pageData.densityStorageKey}
        railState={pageData.railState}
        nextActionHref={pageData.nextActionHref}
        versionVisibility={pageData.versionVisibility}
        rows={pageData.rows}
        feedbackItems={pageData.feedbackItems}
        labels={pageData.labels}
      />

      {pageData.reviewSummary ? (
        <DraftReviewFinalizationGate
          eventId={eventId}
          summary={pageData.reviewSummary}
          labels={pageData.labels.reviewGate}
        />
      ) : null}
    </div>
  );
}
