import { CaptureBibEntryList } from '@/components/results/organizer/capture-bib-entry-list';
import { OrganizerResultsLane } from '@/components/results/organizer/organizer-results-lane';
import { getTranslations } from 'next-intl/server';

import { getResultsWorkspacePageData } from '../_results-workspace';

type ResultsCaptureViewProps = {
  locale: string;
  eventId: string;
};

export async function ResultsCaptureView({ locale, eventId }: ResultsCaptureViewProps) {
  const t = await getTranslations('pages.dashboardEvents.resultsWorkspace');

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
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{t('lanes.capture.title')}</h2>
        <p className="text-muted-foreground">{t('lanes.capture.description')}</p>
      </header>

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
