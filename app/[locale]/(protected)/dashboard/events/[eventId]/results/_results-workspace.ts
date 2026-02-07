import { getAuthContext } from '@/lib/auth/server';
import {
  buildOrganizerDraftReviewSummary,
  getOrganizerResultVersionVisibility,
  getOrganizerResultsRailState,
  getSafeNextDetailsFeedback,
  listOrganizerResultsRows,
  type OrganizerDraftReviewSummary,
  type OrganizerResultsLane,
  type OrganizerResultVersionVisibility,
} from '@/lib/events/results/workspace';
import { getTranslations } from 'next-intl/server';

type ResultsWorkspacePageData = {
  userScopeKey: string;
  densityStorageKey: string;
  railState: Awaited<ReturnType<typeof getOrganizerResultsRailState>>;
  versionVisibility: {
    activeOfficialVersionId: OrganizerResultVersionVisibility['activeOfficialVersionId'];
    items: Array<
      OrganizerResultVersionVisibility['items'][number] & {
        finalizedAtLabel: string;
      }
    >;
  };
  rows: Array<
    Awaited<ReturnType<typeof listOrganizerResultsRows>>[number] & {
      updatedAtLabel: string;
    }
  >;
  reviewSummary: OrganizerDraftReviewSummary | null;
  feedbackItems: ReturnType<typeof getSafeNextDetailsFeedback>;
  labels: {
    stateRail: Parameters<
      typeof import('@/components/results/primitives/results-state-rail').ResultsStateRail
    >[0]['labels'];
    versionVisibility: Parameters<
      typeof import('@/components/results/organizer/results-version-visibility-panel').ResultsVersionVisibilityPanel
    >[0]['labels'];
    table: Parameters<
      typeof import('@/components/results/organizer/table-pro-results-grid').TableProResultsGrid
    >[0]['labels'];
    reviewGate: Parameters<
      typeof import('@/components/results/organizer/draft-review-finalization-gate').DraftReviewFinalizationGate
    >[0]['labels'];
    feedback: {
      heading: string;
      safe: string;
      next: string;
      details: string;
    };
  };
};

export async function getResultsWorkspacePageData(
  eventId: string,
  locale: string,
  lane: OrganizerResultsLane,
): Promise<ResultsWorkspacePageData> {
  const authContext = await getAuthContext();
  const t = await getTranslations('pages.dashboardEvents.resultsWorkspace');

  const [railState, rows, versionVisibility] = await Promise.all([
    getOrganizerResultsRailState(eventId, lane),
    listOrganizerResultsRows(eventId, lane, 30, {
      allowFallback: lane !== 'review',
    }),
    getOrganizerResultVersionVisibility(eventId, 8),
  ]);

  const feedbackItems = getSafeNextDetailsFeedback(lane);
  const reviewSummary =
    lane === 'review'
      ? buildOrganizerDraftReviewSummary(eventId, rows)
      : null;
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return {
    userScopeKey: authContext.user?.id ?? 'unknown',
    densityStorageKey: `results.density.${authContext.user?.id ?? 'unknown'}.${eventId}`,
    railState,
    versionVisibility: {
      activeOfficialVersionId: versionVisibility.activeOfficialVersionId,
      items: versionVisibility.items.map((item) => ({
        ...item,
        finalizedAtLabel: item.finalizedAt ? formatter.format(item.finalizedAt) : '',
      })),
    },
    rows: rows.map((row) => ({
      ...row,
      validationState:
        reviewSummary?.validationStateByRowId[row.id] ?? row.validationState,
      updatedAtLabel: formatter.format(row.updatedAt),
    })),
    reviewSummary,
    feedbackItems,
    labels: {
      stateRail: {
        title: t('stateRail.title'),
        description: t('stateRail.description'),
        lifecycle: t('stateRail.lifecycle'),
        lifecycleDraft: t('stateRail.lifecycleDraft'),
        lifecycleOfficial: t('stateRail.lifecycleOfficial'),
        lifecycleDraftHint: t('stateRail.lifecycleDraftHint'),
        lifecycleOfficialHint: t('stateRail.lifecycleOfficialHint'),
        connectivity: t('stateRail.connectivity'),
        connectivityOnline: t('stateRail.connectivityOnline'),
        connectivityOffline: t('stateRail.connectivityOffline'),
        connectivityOnlineHint: t('stateRail.connectivityOnlineHint'),
        connectivityOfflineHint: t('stateRail.connectivityOfflineHint'),
        unsyncedCount: t('stateRail.unsyncedCount'),
        nextAction: t('stateRail.nextAction'),
        nextActionSyncPending: t('stateRail.nextActionSyncPending'),
        nextActionReviewDraft: t('stateRail.nextActionReviewDraft'),
        nextActionReadyToPublish: t('stateRail.nextActionReadyToPublish'),
        nextActionStartIngestion: t('stateRail.nextActionStartIngestion'),
      },
      versionVisibility: {
        title: t('versionVisibility.title'),
        description: t('versionVisibility.description'),
        empty: t('versionVisibility.empty'),
        noOfficialVersion: t('versionVisibility.noOfficialVersion'),
        activeOfficialLabel: t('versionVisibility.activeOfficialLabel'),
        activeMarker: t('versionVisibility.activeMarker'),
        historicalMarker: t('versionVisibility.historicalMarker'),
        headers: {
          version: t('versionVisibility.headers.version'),
          status: t('versionVisibility.headers.status'),
          finalizedAt: t('versionVisibility.headers.finalizedAt'),
          finalizedBy: t('versionVisibility.headers.finalizedBy'),
          marker: t('versionVisibility.headers.marker'),
        },
        status: {
          draft: t('versionVisibility.status.draft'),
          official: t('versionVisibility.status.official'),
          corrected: t('versionVisibility.status.corrected'),
        },
        unknownFinalizedAt: t('versionVisibility.unknownFinalizedAt'),
        unknownFinalizedBy: t('versionVisibility.unknownFinalizedBy'),
      },
      table: {
        title: t('table.title'),
        description: t('table.description'),
        empty: t('table.empty'),
        headers: {
          bib: t('table.headers.bib'),
          runner: t('table.headers.runner'),
          validation: t('table.headers.validation'),
          resultStatus: t('table.headers.resultStatus'),
          syncStatus: t('table.headers.syncStatus'),
          finishTime: t('table.headers.finishTime'),
          updated: t('table.headers.updated'),
          details: t('table.headers.details'),
        },
        density: {
          label: t('density.label'),
          compact: t('density.compact'),
          full: t('density.full'),
        },
        resultStatus: {
          finish: t('status.finish'),
          dnf: t('status.dnf'),
          dns: t('status.dns'),
          dq: t('status.dq'),
        },
        syncStatus: {
          synced: t('status.synced'),
          pendingSync: t('status.pendingSync'),
          conflict: t('status.conflict'),
        },
        validationState: {
          clear: t('validationState.clear'),
          warning: t('validationState.warning'),
          blocker: t('validationState.blocker'),
        },
      },
      reviewGate: {
        title: t('reviewGate.title'),
        description: t('reviewGate.description'),
        attemptProceedAction: t('reviewGate.attemptProceedAction'),
        finalizePendingAction: t('reviewGate.finalizePendingAction'),
        proceedBlockedMessage: t('reviewGate.proceedBlockedMessage'),
        proceedReadyMessage: t('reviewGate.proceedReadyMessage'),
        proceedUnavailableMessage: t('reviewGate.proceedUnavailableMessage'),
        finalizeSuccessMessage: t('reviewGate.finalizeSuccessMessage'),
        finalizeFailurePrefix: t('reviewGate.finalizeFailurePrefix'),
        nextRequiredActionLabel: t('reviewGate.nextRequiredActionLabel'),
        issueListTitle: t('reviewGate.issueListTitle'),
        issueListDescription: t('reviewGate.issueListDescription'),
        issueListEmpty: t('reviewGate.issueListEmpty'),
        blockerCountLabel: t('reviewGate.blockerCountLabel'),
        warningCountLabel: t('reviewGate.warningCountLabel'),
        rowCountLabel: t('reviewGate.rowCountLabel'),
        issueSeverity: {
          blocker: t('reviewGate.issueSeverity.blocker'),
          warning: t('reviewGate.issueSeverity.warning'),
        },
        issueFields: {
          bib: t('reviewGate.issueFields.bib'),
          runner: t('reviewGate.issueFields.runner'),
          guidance: t('reviewGate.issueFields.guidance'),
        },
        remediationAction: {
          capture: t('reviewGate.remediationAction.capture'),
          import: t('reviewGate.remediationAction.import'),
        },
      },
      feedback: {
        heading: t('feedback.heading'),
        safe: t('feedback.safe'),
        next: t('feedback.next'),
        details: t('feedback.details'),
      },
    },
  };
}
