import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { resultEntries, resultIngestionSessions, resultVersions } from '@/db/schema';
import type {
  ResultEntryStatus,
  ResultIngestionSourceLane,
  ResultVersionStatus,
} from '@/lib/events/results/types';

export type OrganizerResultsLane = 'capture' | 'import' | 'review';
export type ResultsLifecycleState = 'draft' | 'official';
export type ResultsConnectivityState = 'offline' | 'online';
export type ResultsSyncStatus = 'synced' | 'pending_sync' | 'conflict';
export type ResultsValidationState = 'clear' | 'warning' | 'blocker';
export type ResultsNextActionKey =
  | 'syncPending'
  | 'reviewDraft'
  | 'readyToPublish'
  | 'startIngestion';

export type OrganizerResultsRailState = {
  lifecycle: ResultsLifecycleState;
  connectivity: ResultsConnectivityState;
  unsyncedCount: number;
  nextActionKey: ResultsNextActionKey;
};

export type OrganizerResultVersionVisibilityItem = {
  id: string;
  versionNumber: number;
  status: ResultVersionStatus;
  isActiveOfficial: boolean;
  finalizedAt: Date | null;
  finalizedByUserId: string | null;
  createdAt: Date;
};

export type OrganizerResultVersionVisibility = {
  activeOfficialVersionId: string | null;
  items: OrganizerResultVersionVisibilityItem[];
};

export type OrganizerResultsRow = {
  id: string;
  bibNumber: string | null;
  runnerName: string;
  sourceLane: ResultIngestionSourceLane;
  resultStatus: ResultEntryStatus;
  validationState?: ResultsValidationState;
  syncStatus: ResultsSyncStatus;
  finishTimeMillis: number | null;
  updatedAt: Date;
  details: string;
};

export type OrganizerDraftReviewIssueSeverity = 'blocker' | 'warning';
export type OrganizerDraftReviewRemediationLane = Extract<
  OrganizerResultsLane,
  'capture' | 'import'
>;

export type OrganizerDraftReviewIssue = {
  id: string;
  rowId: string;
  rowBibNumber: string | null;
  rowRunnerName: string;
  severity: OrganizerDraftReviewIssueSeverity;
  message: string;
  guidance: string;
  remediationLane: OrganizerDraftReviewRemediationLane;
};

export type OrganizerDraftReviewSummary = {
  rowCount: number;
  blockerCount: number;
  warningCount: number;
  canProceed: boolean;
  issues: OrganizerDraftReviewIssue[];
  nextRequiredAction: OrganizerDraftReviewIssue | null;
  validationStateByRowId: Record<string, ResultsValidationState>;
};

export type SafeNextDetailsTone = 'info' | 'warning' | 'danger';

export type SafeNextDetailsFeedback = {
  id: string;
  tone: SafeNextDetailsTone;
  safe: string;
  next: string;
  details: string[];
};

type TranslationFn = (key: string, values?: Record<string, string | number>) => string;

const OFFLINE_FALLBACK_UNSYNCED_COUNT = 2;
const DEFAULT_RESULT_STATUS: ResultEntryStatus = 'finish';
const DEFAULT_SYNC_STATUS_BY_LANE: Record<OrganizerResultsLane, ResultsSyncStatus> = {
  capture: 'pending_sync',
  import: 'synced',
  review: 'conflict',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return null;
}

function toResultStatus(value: unknown): ResultEntryStatus | null {
  if (value === 'finish' || value === 'dq' || value === 'dnf' || value === 'dns') {
    return value;
  }
  return null;
}

function toSyncStatus(value: unknown): ResultsSyncStatus | null {
  if (value === 'synced' || value === 'pending_sync' || value === 'conflict') {
    return value;
  }
  return null;
}

function toValidationState(value: unknown): ResultsValidationState | null {
  if (value === 'clear' || value === 'warning' || value === 'blocker') {
    return value;
  }
  return null;
}

function toSourceLane(value: unknown): ResultIngestionSourceLane | null {
  if (value === 'manual_offline' || value === 'csv_excel') {
    return value;
  }
  return null;
}

function toRemediationLane(
  sourceLane: ResultIngestionSourceLane,
): OrganizerDraftReviewRemediationLane {
  return sourceLane === 'manual_offline' ? 'capture' : 'import';
}

function inferSourceLane(
  lane: OrganizerResultsLane,
  syncStatus: ResultsSyncStatus,
): ResultIngestionSourceLane {
  if (lane === 'capture') return 'manual_offline';
  if (lane === 'import') return 'csv_excel';
  return syncStatus === 'pending_sync' || syncStatus === 'conflict'
    ? 'manual_offline'
    : 'csv_excel';
}

function deriveValidationState(params: {
  resultStatus: ResultEntryStatus;
  syncStatus: ResultsSyncStatus;
  finishTimeMillis: number | null;
}): ResultsValidationState {
  if (params.syncStatus === 'pending_sync' || params.syncStatus === 'conflict') {
    return 'blocker';
  }
  if (params.resultStatus === 'finish' && params.finishTimeMillis === null) {
    return 'blocker';
  }
  if (params.resultStatus !== 'finish' && params.finishTimeMillis !== null) {
    return 'warning';
  }
  return 'clear';
}

function readUnsyncedCount(
  provenance: Record<string, unknown> | null | undefined,
  fallback: number,
): number {
  if (!provenance) return fallback;

  const fromUnsynced = toPositiveInteger(provenance.unsyncedCount);
  if (fromUnsynced !== null) return fromUnsynced;

  const fromPending = toPositiveInteger(provenance.pendingCount);
  if (fromPending !== null) return fromPending;

  return fallback;
}

function getFallbackRowsForLane(
  lane: OrganizerResultsLane,
  t?: TranslationFn,
): OrganizerResultsRow[] {
  const now = new Date();
  const fallbackDetails = {
    default: t
      ? t('fallbackRows.defaultDetails')
      : 'Draft result row available in organizer workflow.',
    captureSavedLocally: t
      ? t('fallbackRows.capture.savedLocally')
      : 'Saved locally from mobile capture session.',
    captureOfflineCheckpoint: t
      ? t('fallbackRows.capture.offlineCheckpoint')
      : 'Status confirmed during offline checkpoint.',
    importParsed: t
      ? t('fallbackRows.import.parsed')
      : 'Parsed from latest CSV draft import.',
    importDuplicateBib: t
      ? t('fallbackRows.import.duplicateBib')
      : 'Duplicate bib conflict flagged for review.',
    reviewReady: t
      ? t('fallbackRows.review.ready')
      : 'Draft row ready for final organizer review.',
    reviewPendingConflict: t
      ? t('fallbackRows.review.pendingConflict')
      : 'Pending conflict resolution before final review.',
  };

  if (lane === 'capture') {
    return [
      {
        id: 'capture-101',
        bibNumber: '101',
        runnerName: 'Ana Rivera',
        sourceLane: 'manual_offline',
        resultStatus: 'finish',
        validationState: 'blocker',
        syncStatus: 'pending_sync',
        finishTimeMillis: 23 * 60 * 1000 + 42 * 1000,
        updatedAt: now,
        details: fallbackDetails.captureSavedLocally,
      },
      {
        id: 'capture-118',
        bibNumber: '118',
        runnerName: 'Carlos Mendoza',
        sourceLane: 'manual_offline',
        resultStatus: 'dnf',
        validationState: 'blocker',
        syncStatus: 'pending_sync',
        finishTimeMillis: null,
        updatedAt: now,
        details: fallbackDetails.captureOfflineCheckpoint,
      },
    ];
  }

  if (lane === 'import') {
    return [
      {
        id: 'import-202',
        bibNumber: '202',
        runnerName: 'Lucia Torres',
        sourceLane: 'csv_excel',
        resultStatus: 'finish',
        validationState: 'clear',
        syncStatus: 'synced',
        finishTimeMillis: 45 * 60 * 1000 + 5 * 1000,
        updatedAt: now,
        details: fallbackDetails.importParsed,
      },
      {
        id: 'import-227',
        bibNumber: '227',
        runnerName: 'Mateo Silva',
        sourceLane: 'csv_excel',
        resultStatus: 'dq',
        validationState: 'blocker',
        syncStatus: 'conflict',
        finishTimeMillis: null,
        updatedAt: now,
        details: fallbackDetails.importDuplicateBib,
      },
    ];
  }

  return [
    {
      id: 'review-309',
      bibNumber: '309',
      runnerName: 'Elena Cruz',
      sourceLane: 'csv_excel',
      resultStatus: 'finish',
      validationState: 'clear',
      syncStatus: 'synced',
      finishTimeMillis: 37 * 60 * 1000 + 19 * 1000,
      updatedAt: now,
      details: fallbackDetails.reviewReady,
    },
    {
      id: 'review-311',
      bibNumber: '311',
      runnerName: 'Diego Lara',
      sourceLane: 'manual_offline',
      resultStatus: 'dns',
      validationState: 'blocker',
      syncStatus: 'conflict',
      finishTimeMillis: null,
      updatedAt: now,
      details: fallbackDetails.reviewPendingConflict,
    },
  ];
}

type OrganizerResultVersionVisibilityRow = Pick<
  typeof resultVersions.$inferSelect,
  | 'id'
  | 'versionNumber'
  | 'status'
  | 'finalizedAt'
  | 'finalizedByUserId'
  | 'createdAt'
>;

export function buildOrganizerResultVersionVisibility(
  rows: readonly OrganizerResultVersionVisibilityRow[],
): OrganizerResultVersionVisibility {
  const orderedRows = [...rows].sort((left, right) => {
    if (left.versionNumber !== right.versionNumber) {
      return right.versionNumber - left.versionNumber;
    }
    return right.createdAt.getTime() - left.createdAt.getTime();
  });

  const activeOfficialVersionId =
    orderedRows.find((row) => row.status === 'official' || row.status === 'corrected')?.id ??
    null;

  return {
    activeOfficialVersionId,
    items: orderedRows.map((row) => ({
      id: row.id,
      versionNumber: row.versionNumber,
      status: row.status,
      isActiveOfficial: row.id === activeOfficialVersionId,
      finalizedAt: row.finalizedAt,
      finalizedByUserId: row.finalizedByUserId,
      createdAt: row.createdAt,
    })),
  };
}

export async function getOrganizerResultsRailState(
  editionId: string,
  lane: OrganizerResultsLane,
): Promise<OrganizerResultsRailState> {
  const [latestVersion] = await db
    .select({
      status: resultVersions.status,
    })
    .from(resultVersions)
    .where(and(eq(resultVersions.editionId, editionId), isNull(resultVersions.deletedAt)))
    .orderBy(desc(resultVersions.versionNumber), desc(resultVersions.createdAt))
    .limit(1);

  const [latestSession] = await db
    .select({
      sourceLane: resultIngestionSessions.sourceLane,
      provenanceJson: resultIngestionSessions.provenanceJson,
    })
    .from(resultIngestionSessions)
    .where(and(eq(resultIngestionSessions.editionId, editionId), isNull(resultIngestionSessions.deletedAt)))
    .orderBy(desc(resultIngestionSessions.startedAt), desc(resultIngestionSessions.createdAt))
    .limit(1);

  const lifecycle: ResultsLifecycleState =
    latestVersion?.status === 'official' ? 'official' : 'draft';

  const laneFallbackUnsynced = lane === 'capture' ? OFFLINE_FALLBACK_UNSYNCED_COUNT : 0;
  const unsyncedCount = readUnsyncedCount(
    latestSession?.provenanceJson ?? null,
    laneFallbackUnsynced,
  );
  const connectivity: ResultsConnectivityState =
    unsyncedCount > 0 || lane === 'capture' ? 'offline' : 'online';

  const nextActionKey: ResultsNextActionKey =
    unsyncedCount > 0
      ? 'syncPending'
      : lifecycle === 'draft'
        ? lane === 'review'
          ? 'readyToPublish'
          : 'reviewDraft'
        : 'startIngestion';

  return {
    lifecycle,
    connectivity,
    unsyncedCount,
    nextActionKey,
  };
}

export async function getOrganizerResultVersionVisibility(
  editionId: string,
  limit = 8,
): Promise<OrganizerResultVersionVisibility> {
  const rows = await db
    .select({
      id: resultVersions.id,
      versionNumber: resultVersions.versionNumber,
      status: resultVersions.status,
      finalizedAt: resultVersions.finalizedAt,
      finalizedByUserId: resultVersions.finalizedByUserId,
      createdAt: resultVersions.createdAt,
    })
    .from(resultVersions)
    .where(and(eq(resultVersions.editionId, editionId), isNull(resultVersions.deletedAt)))
    .orderBy(desc(resultVersions.versionNumber), desc(resultVersions.createdAt))
    .limit(Math.max(limit, 1));

  return buildOrganizerResultVersionVisibility(rows);
}

export async function listOrganizerResultsRows(
  editionId: string,
  lane: OrganizerResultsLane,
  limit = 30,
  options: {
    allowFallback?: boolean;
    t?: TranslationFn;
  } = {},
): Promise<OrganizerResultsRow[]> {
  const allowFallback = options.allowFallback ?? true;
  const detailsFallback = options.t
    ? options.t('fallbackRows.defaultDetails')
    : 'Draft result row available in organizer workflow.';
  const [latestDraftVersion] = await db
    .select({
      id: resultVersions.id,
    })
    .from(resultVersions)
    .where(
      and(
        eq(resultVersions.editionId, editionId),
        eq(resultVersions.status, 'draft'),
        isNull(resultVersions.deletedAt),
      ),
    )
    .orderBy(desc(resultVersions.versionNumber), desc(resultVersions.createdAt))
    .limit(1);

  if (!latestDraftVersion) {
    return allowFallback ? getFallbackRowsForLane(lane, options.t) : [];
  }

  const rows = await db
    .select({
      id: resultEntries.id,
      bibNumber: resultEntries.bibNumber,
      runnerFullName: resultEntries.runnerFullName,
      status: resultEntries.status,
      finishTimeMillis: resultEntries.finishTimeMillis,
      rawSourceData: resultEntries.rawSourceData,
      updatedAt: resultEntries.updatedAt,
    })
    .from(resultEntries)
    .where(
      and(
        eq(resultEntries.resultVersionId, latestDraftVersion.id),
        isNull(resultEntries.deletedAt),
      ),
    )
    .orderBy(desc(resultEntries.updatedAt), desc(resultEntries.createdAt))
    .limit(Math.max(limit, 1));

  if (rows.length === 0) {
    return allowFallback ? getFallbackRowsForLane(lane, options.t) : [];
  }

  const fallbackSyncStatus = DEFAULT_SYNC_STATUS_BY_LANE[lane];

  return rows.map((row) => {
    const rawSourceData = isRecord(row.rawSourceData) ? row.rawSourceData : null;
    const resultStatus = toResultStatus(row.status) ?? DEFAULT_RESULT_STATUS;
    const syncStatus =
      toSyncStatus(rawSourceData?.syncStatus) ?? fallbackSyncStatus;
    const sourceLane =
      toSourceLane(rawSourceData?.sourceLane) ??
      inferSourceLane(lane, syncStatus);
    const validationState =
      toValidationState(rawSourceData?.validationState) ??
      deriveValidationState({
        resultStatus,
        syncStatus,
        finishTimeMillis: row.finishTimeMillis,
      });
      const details =
        typeof rawSourceData?.message === 'string'
          ? rawSourceData.message
          : typeof rawSourceData?.notes === 'string'
            ? rawSourceData.notes
            : detailsFallback;

    return {
      id: row.id,
      bibNumber: row.bibNumber,
      runnerName: row.runnerFullName,
      sourceLane,
      resultStatus,
      validationState,
      syncStatus,
      finishTimeMillis: row.finishTimeMillis,
      updatedAt: row.updatedAt,
      details,
    };
  });
}

export function buildOrganizerDraftReviewSummary(
  editionId: string,
  rows: OrganizerResultsRow[],
  options?: {
    t?: TranslationFn;
  },
): OrganizerDraftReviewSummary {
  const issues: OrganizerDraftReviewIssue[] = [];
  const validationStateByRowId: Record<string, ResultsValidationState> = {};
  const t = options?.t;

  for (const row of rows) {
    const remediationLane = toRemediationLane(row.sourceLane);
    let rowValidationState: ResultsValidationState =
      row.validationState ??
      deriveValidationState({
        resultStatus: row.resultStatus,
        syncStatus: row.syncStatus,
        finishTimeMillis: row.finishTimeMillis,
      });

    if (row.syncStatus === 'conflict') {
      issues.push({
        id: `${row.id}-conflict`,
        rowId: row.id,
        rowBibNumber: row.bibNumber,
        rowRunnerName: row.runnerName,
        severity: 'blocker',
        message: t
          ? t('reviewIssues.conflict.message')
          : 'Conflict resolution is still required for this draft row.',
        guidance: t
          ? t('reviewIssues.conflict.guidance')
          : 'Resolve the explicit sync conflict before attempting finalization.',
        remediationLane,
      });
      rowValidationState = 'blocker';
    } else if (row.syncStatus === 'pending_sync') {
      issues.push({
        id: `${row.id}-pending-sync`,
        rowId: row.id,
        rowBibNumber: row.bibNumber,
        rowRunnerName: row.runnerName,
        severity: 'blocker',
        message: t
          ? t('reviewIssues.pendingSync.message')
          : 'This row is still pending synchronization.',
        guidance: t
          ? t('reviewIssues.pendingSync.guidance')
          : 'Run deterministic sync until pending rows reach synced state.',
        remediationLane: 'capture',
      });
      rowValidationState = 'blocker';
    }

    if (row.resultStatus === 'finish' && row.finishTimeMillis === null) {
      issues.push({
        id: `${row.id}-missing-finish-time`,
        rowId: row.id,
        rowBibNumber: row.bibNumber,
        rowRunnerName: row.runnerName,
        severity: 'blocker',
        message: t
          ? t('reviewIssues.missingFinishTime.message')
          : 'Finish status row is missing a finish time.',
        guidance: t
          ? t('reviewIssues.missingFinishTime.guidance')
          : 'Provide a valid finish time before continuing to finalization.',
        remediationLane,
      });
      rowValidationState = 'blocker';
    }

    if (
      row.resultStatus !== 'finish' &&
      row.finishTimeMillis !== null &&
      rowValidationState !== 'blocker'
    ) {
      issues.push({
        id: `${row.id}-status-time-mismatch`,
        rowId: row.id,
        rowBibNumber: row.bibNumber,
        rowRunnerName: row.runnerName,
        severity: 'warning',
        message: t
          ? t('reviewIssues.statusTimeMismatch.message')
          : 'Non-finish status row still includes a finish time value.',
        guidance: t
          ? t('reviewIssues.statusTimeMismatch.guidance')
          : 'Confirm the status/time combination is intentional before publishing.',
        remediationLane,
      });
      rowValidationState = 'warning';
    }

    validationStateByRowId[row.id] = rowValidationState;
  }

  const blockerCount = issues.filter((issue) => issue.severity === 'blocker').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const canProceed = rows.length > 0 && blockerCount === 0;

  return {
    rowCount: rows.length,
    blockerCount,
    warningCount,
    canProceed,
    issues,
    nextRequiredAction:
      issues.find((issue) => issue.severity === 'blocker') ?? null,
    validationStateByRowId,
  };
}

export function getSafeNextDetailsFeedback(
  input: {
    lane: OrganizerResultsLane;
    railState: OrganizerResultsRailState;
    rows: readonly OrganizerResultsRow[];
    reviewSummary: OrganizerDraftReviewSummary | null;
    t?: TranslationFn;
  },
): SafeNextDetailsFeedback[] {
  const lane = input.lane;
  const rows = input.rows;
  const t = input.t;

  const countSyncStatus = (status: ResultsSyncStatus) =>
    rows.reduce((count, row) => (row.syncStatus === status ? count + 1 : count), 0);
  const countValidationState = (state: ResultsValidationState) =>
    rows.reduce((count, row) => (row.validationState === state ? count + 1 : count), 0);
  const pluralize = (count: number, singular: string, plural: string) =>
    `${count} ${count === 1 ? singular : plural}`;

  if (lane === 'review') {
    const summary = input.reviewSummary;
    if (!summary) return [];

    if (summary.rowCount === 0) {
      return [
        {
          id: 'review-empty',
          tone: 'info',
          safe: t
            ? t('laneFeedback.review.empty.safe')
            : 'No draft rows are ready for review yet.',
          next: t
            ? t('laneFeedback.review.empty.next')
            : 'Start capture or import to create a draft before publishing official results.',
          details: [
            t
              ? t('laneFeedback.review.empty.details.draftProtection')
              : 'Draft rows remain protected until an organizer publishes an Official version.',
            t
              ? t('laneFeedback.review.empty.details.blockersWarningsSummary')
              : 'Once draft rows exist, blockers and warnings will be summarized here.',
          ],
        },
      ];
    }

    if (summary.blockerCount > 0) {
      return [
        {
          id: 'review-blockers',
          tone: 'danger',
          safe: t
            ? t('laneFeedback.review.blockers.safe')
            : 'Official output is protected while this draft is under review.',
          next: t
            ? t('laneFeedback.review.blockers.next')
            : 'Resolve blockers before publishing official results.',
          details: [
            t
              ? t('laneFeedback.review.blockers.details.blockerCount', {
                  count: summary.blockerCount,
                })
              : `${pluralize(summary.blockerCount, 'blocker', 'blockers')} must be resolved before publishing.`,
            summary.warningCount > 0
              ? t
                ? t('laneFeedback.review.blockers.details.warningCount', {
                    count: summary.warningCount,
                  })
                : `${pluralize(summary.warningCount, 'warning', 'warnings')} should be reviewed before publishing.`
              : t
                ? t('laneFeedback.review.blockers.details.noWarnings')
                : 'No warnings are currently flagged.',
          ],
        },
      ];
    }

    if (summary.warningCount > 0) {
      return [
        {
          id: 'review-warnings',
          tone: 'warning',
          safe: t
            ? t('laneFeedback.review.warnings.safe')
            : 'Draft is protected and can still be adjusted before it becomes Official.',
          next: t
            ? t('laneFeedback.review.warnings.next')
            : 'Review warnings, then publish official results when appropriate.',
          details: [
            t
              ? t('laneFeedback.review.warnings.details.warningCount', {
                  count: summary.warningCount,
                })
              : `${pluralize(summary.warningCount, 'warning', 'warnings')} are present in this draft.`,
            t
              ? t('laneFeedback.review.warnings.details.warningsNonBlocking')
              : 'Warnings do not necessarily block publication, but should be confirmed intentionally.',
          ],
        },
      ];
    }

    // Green state: suppress SAFE/NEXT/DETAILS noise.
    return [];
  }

  if (lane === 'capture') {
    const unsyncedCount = input.railState.unsyncedCount;
    const conflictCount = countSyncStatus('conflict');
    const pendingSyncCount = countSyncStatus('pending_sync');
    const blockerCount = countValidationState('blocker');
    const warningCount = countValidationState('warning');

    if (unsyncedCount > 0 || pendingSyncCount > 0) {
      const pending = Math.max(unsyncedCount, pendingSyncCount);
      return [
        {
          id: 'capture-sync-pending',
          tone: 'warning',
          safe: t
            ? t('laneFeedback.capture.syncPending.safe')
            : 'Captured rows stay in Draft and are saved locally.',
          next: t
            ? t('laneFeedback.capture.syncPending.next')
            : 'Reconnect and run sync to upload pending entries.',
          details: [
            t
              ? t('laneFeedback.capture.syncPending.details.rowsWaitingForSync', { count: pending })
              : `${pluralize(pending, 'row is', 'rows are')} waiting for sync.`,
            t
              ? t('laneFeedback.capture.syncPending.details.noPublicChanges')
              : 'No public or official records were changed.',
          ],
        },
      ];
    }

    if (conflictCount > 0 || blockerCount > 0) {
      return [
        {
          id: 'capture-blocked',
          tone: 'danger',
          safe: t
            ? t('laneFeedback.capture.blocked.safe')
            : 'Draft capture remains protected while blockers are unresolved.',
          next: t
            ? t('laneFeedback.capture.blocked.next')
            : 'Resolve conflicts/blockers, then re-run sync and review.',
          details: [
            conflictCount > 0
              ? t
                ? t('laneFeedback.capture.blocked.details.conflictCount', { count: conflictCount })
                : `${pluralize(conflictCount, 'row requires', 'rows require')} conflict confirmation.`
              : t
                ? t('laneFeedback.capture.blocked.details.noConflicts')
                : 'No conflicts are currently flagged.',
            blockerCount > 0
              ? t
                ? t('laneFeedback.capture.blocked.details.blockerCount', { count: blockerCount })
                : `${pluralize(blockerCount, 'blocker is', 'blockers are')} still present in the draft.`
              : t
                ? t('laneFeedback.capture.blocked.details.noBlockers')
                : 'No blockers are currently flagged.',
          ],
        },
      ];
    }

    if (warningCount > 0) {
      return [
        {
          id: 'capture-warnings',
          tone: 'warning',
          safe: t
            ? t('laneFeedback.capture.warnings.safe')
            : 'Draft capture is protected and can be refined before review.',
          next: t
            ? t('laneFeedback.capture.warnings.next')
            : 'Review warnings, then move to the Review lane.',
          details: [
            t
              ? t('laneFeedback.capture.warnings.details.warningCount', { count: warningCount })
              : `${pluralize(warningCount, 'warning is', 'warnings are')} present in the draft.`,
            t
              ? t('laneFeedback.capture.warnings.details.warningsDoNotPublish')
              : 'Warnings do not publish data, but should be reviewed before publishing official results.',
          ],
        },
      ];
    }

    return [];
  }

  // lane === 'import'
  const conflictCount = countSyncStatus('conflict');
  const blockerCount = countValidationState('blocker');
  const warningCount = countValidationState('warning');

  if (conflictCount > 0 || blockerCount > 0) {
    return [
      {
        id: 'import-blocked',
        tone: 'danger',
        safe: t
          ? t('laneFeedback.import.blocked.safe')
          : 'Draft import is protected and not public yet.',
        next: t
          ? t('laneFeedback.import.blocked.next')
          : 'Resolve conflicts/blockers, then review the draft before publishing.',
        details: [
          conflictCount > 0
            ? t
              ? t('laneFeedback.import.blocked.details.conflictCount', { count: conflictCount })
              : `${pluralize(conflictCount, 'row requires', 'rows require')} conflict resolution.`
            : t
              ? t('laneFeedback.import.blocked.details.noConflicts')
              : 'No conflicts are currently flagged.',
          blockerCount > 0
            ? t
              ? t('laneFeedback.import.blocked.details.blockerCount', { count: blockerCount })
              : `${pluralize(blockerCount, 'blocker is', 'blockers are')} still present in the draft.`
            : t
              ? t('laneFeedback.import.blocked.details.noBlockers')
              : 'No blockers are currently flagged.',
        ],
      },
    ];
  }

  if (warningCount > 0) {
    return [
      {
        id: 'import-warnings',
        tone: 'warning',
        safe: t
          ? t('laneFeedback.import.warnings.safe')
          : 'Draft import is protected and can be refined before review.',
        next: t
          ? t('laneFeedback.import.warnings.next')
          : 'Review warnings, then move to the Review lane.',
        details: [
          t
            ? t('laneFeedback.import.warnings.details.warningCount', { count: warningCount })
            : `${pluralize(warningCount, 'warning is', 'warnings are')} present in the draft.`,
          t
            ? t('laneFeedback.import.warnings.details.warningsDoNotPublish')
            : 'Warnings do not publish data, but should be reviewed before publishing official results.',
        ],
      },
    ];
  }

  return [];
}
