import { CaptureBibEntryList } from '@/components/results/organizer/capture-bib-entry-list';
import { ResultsVersionVisibilityPanel } from '@/components/results/organizer/results-version-visibility-panel';
import { SafeNextDetailsMessage } from '@/components/results/primitives/safe-next-details-message';
import { ResultsStateRail } from '@/components/results/primitives/results-state-rail';
import { MutedSurface } from '@/components/ui/surface';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';

import { ResultsSecondaryBackLink } from '../_results-secondary-back-link';
import { ResultsPageHero } from '../_results-page-hero';
import { getResultsWorkspacePageData } from '../_results-workspace';

type ResultsCaptureViewProps = {
  locale: string;
  eventId: string;
};

type CaptureTemplateKey =
  | 'captureEntry.reassurancePendingSync'
  | 'captureEntry.syncProgressMessage'
  | 'captureEntry.syncInterruptedMessage'
  | 'captureEntry.safeNextDetails.detailConflictSummary';

function getRawTranslation(
  t: Awaited<ReturnType<typeof getTranslations<'pages.dashboardEvents.resultsWorkspace'>>>,
  key: CaptureTemplateKey,
) {
  const value = t.raw(key);
  return typeof value === 'string' ? value : String(value ?? '');
}

export async function ResultsCaptureView({ locale, eventId }: ResultsCaptureViewProps) {
  const [t, pageData] = await Promise.all([
    getTranslations('pages.dashboardEvents.resultsWorkspace'),
    getResultsWorkspacePageData(eventId, locale, 'capture'),
  ]);

  const reviewHref = {
    pathname: '/dashboard/events/[eventId]/results/review',
    params: { eventId },
  } as const;

  return (
    <div className="space-y-6">
      <ResultsPageHero
        backLink={<ResultsSecondaryBackLink eventId={eventId} label={t('title')} />}
        eyebrow={t('lanes.capture.eyebrow' as never)}
        title={t('lanes.capture.title')}
        description={t('lanes.capture.description')}
        stats={[
          {
            label: t('stateRail.lifecycle'),
            value:
              pageData.railState.lifecycle === 'official'
                ? t('stateRail.lifecycleOfficial')
                : t('stateRail.lifecycleDraft'),
          },
          {
            label: t('versionVisibility.title'),
            value: String(pageData.versionVisibility.items.length),
          },
        ]}
        actions={
          <Link
            href={reviewHref}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {t('lanes.review.action')}
          </Link>
        }
      />

      <CaptureBibEntryList
        storageKey={`results.capture.entries.${pageData.userScopeKey}.${eventId}`}
        locale={locale}
        reviewHref={reviewHref}
        labels={{
          title: t('captureEntry.title'),
          description: t('captureEntry.description'),
          connectivityLabel: t('captureEntry.connectivityLabel'),
          connectivityOnline: t('captureEntry.connectivityOnline'),
          connectivityOffline: t('captureEntry.connectivityOffline'),
          reassuranceSavedLocally: t('captureEntry.reassuranceSavedLocally'),
          reassuranceNotPublic: t('captureEntry.reassuranceNotPublic'),
          reassurancePendingSync: getRawTranslation(t, 'captureEntry.reassurancePendingSync'),
          pendingSyncLabel: t('stateRail.unsyncedCount'),
          lastSyncLabel: t('captureEntry.lastSyncLabel' as never),
          lastSyncNever: t('captureEntry.lastSyncNever' as never),
          reviewAction: t('lanes.review.action'),
          bibLabel: t('captureEntry.bibLabel'),
          bibPlaceholder: t('captureEntry.bibPlaceholder'),
          timeLabel: t('captureEntry.timeLabel'),
          timePlaceholder: t('captureEntry.timePlaceholder'),
          statusLabel: t('captureEntry.statusLabel'),
          submitAction: t('captureEntry.submitAction'),
          validationBibRequired: t('captureEntry.validationBibRequired'),
          validationFinishTimeInvalid: t('captureEntry.validationFinishTimeInvalid'),
          entrySaved: t('captureEntry.entrySaved'),
          entriesTitle: t('captureEntry.entriesTitle'),
          entriesDescription: t('captureEntry.entriesDescription'),
          entriesEmpty: t('captureEntry.entriesEmpty'),
          syncTitle: t('captureEntry.syncTitle'),
          syncDescription: t('captureEntry.syncDescription'),
          syncAction: t('captureEntry.syncAction'),
          syncOfflineGuard: t('captureEntry.syncOfflineGuard'),
          syncProgressMessage: getRawTranslation(t, 'captureEntry.syncProgressMessage'),
          syncCompleteMessage: t('captureEntry.syncCompleteMessage'),
          syncInterruptedMessage: getRawTranslation(t, 'captureEntry.syncInterruptedMessage'),
          syncBlockedByConflicts: t('captureEntry.syncBlockedByConflicts'),
          conflictTitle: t('captureEntry.conflictTitle'),
          conflictDescription: t('captureEntry.conflictDescription'),
          conflictEmpty: t('captureEntry.conflictEmpty'),
          conflictNeedsDecision: t('captureEntry.conflictNeedsDecision'),
          conflictResolved: t('captureEntry.conflictResolved'),
          conflictLocalValues: t('captureEntry.conflictLocalValues'),
          conflictServerValues: t('captureEntry.conflictServerValues'),
          conflictFieldBib: t('captureEntry.conflictFieldBib'),
          conflictFieldStatus: t('captureEntry.conflictFieldStatus'),
          conflictFieldFinishTime: t('captureEntry.conflictFieldFinishTime'),
          conflictFieldUpdatedAt: t('captureEntry.conflictFieldUpdatedAt'),
          conflictActionKeepLocal: t('captureEntry.conflictActionKeepLocal'),
          conflictActionKeepServer: t('captureEntry.conflictActionKeepServer'),
          conflictChoiceKeepLocal: t('captureEntry.conflictChoiceKeepLocal'),
          conflictChoiceKeepServer: t('captureEntry.conflictChoiceKeepServer'),
          headers: {
            bib: t('captureEntry.headers.bib'),
            status: t('captureEntry.headers.status'),
            syncStatus: t('captureEntry.headers.syncStatus'),
            finishTime: t('captureEntry.headers.finishTime'),
            derivedOverall: t('captureEntry.headers.derivedOverall'),
            capturedAt: t('captureEntry.headers.capturedAt'),
            provenance: t('captureEntry.headers.provenance'),
          },
          statusOptions: {
            finish: t('captureEntry.statusOptions.finish'),
            dnf: t('captureEntry.statusOptions.dnf'),
            dns: t('captureEntry.statusOptions.dns'),
            dq: t('captureEntry.statusOptions.dq'),
          },
          provenanceSession: t('captureEntry.provenanceSession'),
          provenanceDevice: t('captureEntry.provenanceDevice'),
          provenanceEditor: t('captureEntry.provenanceEditor'),
          syncStatusPending: t('captureEntry.syncStatusPending'),
          syncStatusSynced: t('captureEntry.syncStatusSynced'),
          syncStatusConflict: t('captureEntry.syncStatusConflict'),
          safeNextDetails: {
            safe: t('captureEntry.safeNextDetails.safe'),
            next: t('captureEntry.safeNextDetails.next'),
            details: t('captureEntry.safeNextDetails.details'),
            safeMessage: t('captureEntry.safeNextDetails.safeMessage'),
            nextMessage: t('captureEntry.safeNextDetails.nextMessage'),
            detailConflictSummary: getRawTranslation(
              t,
              'captureEntry.safeNextDetails.detailConflictSummary',
            ),
            detailDraftProtection: t('captureEntry.safeNextDetails.detailDraftProtection'),
          },
        }}
      />

      {pageData.feedbackItems.length > 0 ? (
        <section className="space-y-3" aria-labelledby="results-capture-guidance-title">
          <h2
            id="results-capture-guidance-title"
            className="text-sm font-semibold text-foreground sm:text-base"
          >
            {pageData.labels.feedback.heading}
          </h2>
          <div className="grid gap-3">
            {pageData.feedbackItems.map((item) => (
              <MutedSurface key={item.id} className="p-0">
                <SafeNextDetailsMessage
                  safe={item.safe}
                  next={item.next}
                  details={item.details}
                  tone={item.tone}
                  labels={{
                    safe: pageData.labels.feedback.safe,
                    next: pageData.labels.feedback.next,
                    details: pageData.labels.feedback.details,
                  }}
                />
              </MutedSurface>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="results-capture-publish-context-title">
        <div className="space-y-1">
          <h2
            id="results-capture-publish-context-title"
            className="text-sm font-semibold text-foreground sm:text-base"
          >
            {t('captureEntry.draftStatusTitle' as never)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('captureEntry.draftStatusDescription' as never)}
          </p>
        </div>

        <div className="grid gap-4">
          <ResultsStateRail state={pageData.railState} labels={pageData.labels.stateRail} compact />
          <ResultsVersionVisibilityPanel
            visibility={pageData.versionVisibility}
            labels={pageData.labels.versionVisibility}
          />
        </div>
      </section>
    </div>
  );
}
