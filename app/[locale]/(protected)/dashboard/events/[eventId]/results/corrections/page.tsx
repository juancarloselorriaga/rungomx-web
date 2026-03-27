import { CorrectionAuditTrail } from '@/components/results/organizer/correction-audit-trail';
import { CorrectionLifecycleMetricsPanel } from '@/components/results/organizer/correction-lifecycle-metrics';
import { CorrectionReviewQueue } from '@/components/results/organizer/correction-review-queue';
import { OrganizerResultsLane } from '@/components/results/organizer/organizer-results-lane';
import {
  getCorrectionLifecycleMetrics,
  listCorrectionAuditTrailForEdition,
  listOrganizerCorrectionRequestsForEdition,
} from '@/lib/events/results/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ResultsPageHero } from '../_results-page-hero';
import { getResultsWorkspacePageData } from '../_results-workspace';

type ResultsCorrectionsPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams?: Promise<{
    organizationId?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Results corrections | RunGoMX',
    robots: { index: false, follow: false },
  };
}

function parseDateBoundary(value: string | undefined, kind: 'start' | 'end'): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T${kind === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function ResultsCorrectionsPage({
  params,
  searchParams,
}: ResultsCorrectionsPageProps) {
  const { locale, eventId } = await params;
  const resolvedSearchParams = await searchParams;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/results/corrections' });
  const t = await getTranslations('pages.dashboardEvents.resultsWorkspace');

  const organizationId = resolvedSearchParams?.organizationId;
  const dateFrom = resolvedSearchParams?.dateFrom;
  const dateTo = resolvedSearchParams?.dateTo;

  const requestedFrom = parseDateBoundary(dateFrom, 'start');
  const requestedTo = parseDateBoundary(dateTo, 'end');

  const [pageData, correctionRequests, auditTrail, metrics] = await Promise.all([
    getResultsWorkspacePageData(eventId, locale, 'review'),
    listOrganizerCorrectionRequestsForEdition(eventId, 60),
    listCorrectionAuditTrailForEdition(eventId, 80),
    getCorrectionLifecycleMetrics({
      editionId: eventId,
      organizationId: organizationId || undefined,
      requestedFrom,
      requestedTo,
    }),
  ]);

  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-6">
      <ResultsPageHero
        title={t('lanes.corrections.title')}
        description={t('lanes.corrections.description')}
        stats={[
          {
            label: t('corrections.metrics.summary.total'),
            value: String(metrics.statusCounts.total),
          },
          {
            label: t('corrections.metrics.summary.pending'),
            value: String(metrics.statusCounts.pending),
          },
          {
            label: t('corrections.metrics.summary.approved'),
            value: String(metrics.statusCounts.approved),
          },
          {
            label: t('corrections.metrics.summary.rejected'),
            value: String(metrics.statusCounts.rejected),
          },
        ]}
      />

      <CorrectionReviewQueue
        requests={correctionRequests.map((request) => ({
          ...request,
          requestedAtLabel: formatter.format(request.requestedAt),
          reviewedAtLabel: request.reviewedAt ? formatter.format(request.reviewedAt) : null,
        }))}
        labels={{
          title: t('corrections.title'),
          description: t('corrections.description'),
          empty: t('corrections.empty'),
          status: {
            pending: t('corrections.status.pending'),
            approved: t('corrections.status.approved'),
            rejected: t('corrections.status.rejected'),
          },
          fields: {
            reason: t('corrections.fields.reason'),
            context: t('corrections.fields.context'),
            requestedBy: t('corrections.fields.requestedBy'),
            requestedAt: t('corrections.fields.requestedAt'),
            reviewedBy: t('corrections.fields.reviewedBy'),
            reviewedAt: t('corrections.fields.reviewedAt'),
            reviewNote: t('corrections.fields.reviewNote'),
            runner: t('corrections.fields.runner'),
            bib: t('corrections.fields.bib'),
            entryStatus: t('corrections.fields.entryStatus'),
            finishTime: t('corrections.fields.finishTime'),
          },
          review: {
            notePlaceholder: t('corrections.review.notePlaceholder'),
            approveAction: t('corrections.review.approveAction'),
            rejectAction: t('corrections.review.rejectAction'),
            pendingAction: t('corrections.review.pendingAction'),
            successMessage: t('corrections.review.successMessage'),
            failurePrefix: t('corrections.review.failurePrefix'),
            noDecisionYet: t('corrections.review.noDecisionYet'),
            noContext: t('corrections.review.noContext'),
            noReviewNote: t('corrections.review.noReviewNote'),
            noValue: t('corrections.review.noValue'),
          },
        }}
      />

      <CorrectionLifecycleMetricsPanel
        metrics={metrics}
        locale={locale}
        labels={{
          title: t('corrections.metrics.title'),
          description: t('corrections.metrics.description'),
          generatedAtLabel: t('corrections.metrics.generatedAtLabel'),
          filtersTitle: t('corrections.metrics.filtersTitle'),
          summary: {
            total: t('corrections.metrics.summary.total'),
            pending: t('corrections.metrics.summary.pending'),
            approved: t('corrections.metrics.summary.approved'),
            rejected: t('corrections.metrics.summary.rejected'),
            medianResolutionHours: t('corrections.metrics.summary.medianResolutionHours'),
            oldestPendingHours: t('corrections.metrics.summary.oldestPendingHours'),
          },
          aging: {
            title: t('corrections.metrics.aging.title'),
            description: t('corrections.metrics.aging.description'),
            lessThan24Hours: t('corrections.metrics.aging.lessThan24Hours'),
            oneToThreeDays: t('corrections.metrics.aging.oneToThreeDays'),
            threeToSevenDays: t('corrections.metrics.aging.threeToSevenDays'),
            moreThanSevenDays: t('corrections.metrics.aging.moreThanSevenDays'),
            highlightsTitle: t('corrections.metrics.aging.highlightsTitle'),
            highlightsEmpty: t('corrections.metrics.aging.highlightsEmpty'),
            requestedAt: t('corrections.metrics.aging.requestedAt'),
            requestedBy: t('corrections.metrics.aging.requestedBy'),
            edition: t('corrections.metrics.aging.edition'),
            ageHours: t('corrections.metrics.aging.ageHours'),
          },
          export: {
            action: t('corrections.metrics.export.action'),
            helper: t('corrections.metrics.export.helper'),
            empty: t('corrections.metrics.export.empty'),
            filePrefix: t('corrections.metrics.export.filePrefix'),
          },
          fallback: {
            notAvailable: t('corrections.metrics.fallback.notAvailable'),
            notSet: t('corrections.metrics.fallback.notSet'),
          },
          filters: {
            editionId: t('corrections.metrics.filters.editionId'),
            organizationId: t('corrections.metrics.filters.organizationId'),
            requestedFrom: t('corrections.metrics.filters.requestedFrom'),
            requestedTo: t('corrections.metrics.filters.requestedTo'),
          },
        }}
      />

      <CorrectionAuditTrail
        items={auditTrail.map((item) => ({
          ...item,
          requestedAtLabel: formatter.format(item.requestedAt),
          reviewedAtLabel: item.reviewedAt ? formatter.format(item.reviewedAt) : null,
          publishedAtLabel: item.publishedAt ? formatter.format(item.publishedAt) : null,
        }))}
        labels={{
          title: t('corrections.audit.title'),
          description: t('corrections.audit.description'),
          empty: t('corrections.audit.empty'),
          fields: {
            requestId: t('corrections.audit.fields.requestId'),
            reason: t('corrections.audit.fields.reason'),
            requestedBy: t('corrections.audit.fields.requestedBy'),
            reviewedBy: t('corrections.audit.fields.reviewedBy'),
            requestedAt: t('corrections.audit.fields.requestedAt'),
            reviewedAt: t('corrections.audit.fields.reviewedAt'),
            publishedAt: t('corrections.audit.fields.publishedAt'),
            versionTransition: t('corrections.audit.fields.versionTransition'),
          },
          fallback: {
            pending: t('corrections.audit.fallback.pending'),
            noPublishedAt: t('corrections.audit.fallback.noPublishedAt'),
          },
        }}
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
    </div>
  );
}
