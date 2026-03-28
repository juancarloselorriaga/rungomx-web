import { CaptureBibEntryList } from '@/components/results/organizer/capture-bib-entry-list';
import { ResultsVersionVisibilityPanel } from '@/components/results/organizer/results-version-visibility-panel';
import { SafeNextDetailsMessage } from '@/components/results/primitives/safe-next-details-message';
import { ResultsStateRail } from '@/components/results/primitives/results-state-rail';
import { MutedSurface } from '@/components/ui/surface';
import { getTranslations } from 'next-intl/server';

import { ResultsPageHero } from '../_results-page-hero';
import { getResultsWorkspacePageData } from '../_results-workspace';

type ResultsCaptureViewProps = {
  locale: string;
  eventId: string;
};

export async function ResultsCaptureView({ locale, eventId }: ResultsCaptureViewProps) {
  const t = await getTranslations('pages.dashboardEvents.resultsWorkspace');
  const captureEyebrow = t('lanes.capture.eyebrow' as never);
  const publishContextTitle = t('home.publishReadiness.title' as never);
  const publishContextDescription = t('home.publishReadiness.description' as never);

  type CaptureTemplateKey =
    | 'captureEntry.reassurancePendingSync'
    | 'captureEntry.syncProgressMessage'
    | 'captureEntry.syncInterruptedMessage'
    | 'captureEntry.safeNextDetails.detailConflictSummary';

  const rawLabel = (key: CaptureTemplateKey) => {
    const value = t.raw(key);
    return typeof value === 'string' ? value : String(value ?? '');
  };

  const pageData = await getResultsWorkspacePageData(eventId, locale, 'capture');

  return (
    <div className="space-y-6">
      <ResultsPageHero
        eyebrow={captureEyebrow}
        title={t('lanes.capture.title')}
        description={t('lanes.capture.description')}
        stats={[
          {
            label: t('captureEntry.entriesTitle'),
            value: String(pageData.rows.length),
          },
          {
            label: t('captureEntry.connectivityLabel'),
            value:
              pageData.railState.connectivity === 'online'
                ? t('captureEntry.connectivityOnline')
                : t('captureEntry.connectivityOffline'),
          },
          {
            label: t('stateRail.unsyncedCount'),
            value: String(pageData.railState.unsyncedCount),
          },
        ]}
      />

      <CaptureBibEntryList
        storageKey={`results.capture.entries.${pageData.userScopeKey}.${eventId}`}
        locale={locale}
        labels={{
          title: t('captureEntry.title'),
          description: t('captureEntry.description'),
          connectivityLabel: t('captureEntry.connectivityLabel'),
          connectivityOnline: t('captureEntry.connectivityOnline'),
          connectivityOffline: t('captureEntry.connectivityOffline'),
          reassuranceSavedLocally: t('captureEntry.reassuranceSavedLocally'),
          reassuranceNotPublic: t('captureEntry.reassuranceNotPublic'),
          reassurancePendingSync: rawLabel('captureEntry.reassurancePendingSync'),
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
          syncProgressMessage: rawLabel('captureEntry.syncProgressMessage'),
          syncCompleteMessage: t('captureEntry.syncCompleteMessage'),
          syncInterruptedMessage: rawLabel('captureEntry.syncInterruptedMessage'),
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
            detailConflictSummary: rawLabel('captureEntry.safeNextDetails.detailConflictSummary'),
            detailDraftProtection: t('captureEntry.safeNextDetails.detailDraftProtection'),
          },
        }}
      />

      <section className="space-y-3" aria-labelledby="results-capture-publish-context-title">
        <div className="space-y-1">
          <h2
            id="results-capture-publish-context-title"
            className="text-sm font-semibold text-foreground sm:text-base"
          >
            {publishContextTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{publishContextDescription}</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
          <ResultsStateRail
            state={pageData.railState}
            labels={pageData.labels.stateRail}
            nextActionHref={pageData.nextActionHref}
            compact
          />
          <ResultsVersionVisibilityPanel
            visibility={pageData.versionVisibility}
            labels={pageData.labels.versionVisibility}
          />
        </div>
      </section>

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
    </div>
  );
}
