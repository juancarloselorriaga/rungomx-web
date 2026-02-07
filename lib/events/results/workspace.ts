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

function getFallbackRowsForLane(lane: OrganizerResultsLane): OrganizerResultsRow[] {
  const now = new Date();

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
        details: 'Saved locally from mobile capture session.',
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
        details: 'Status confirmed during offline checkpoint.',
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
        details: 'Parsed from latest CSV draft import.',
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
        details: 'Duplicate bib conflict flagged for review.',
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
      details: 'Draft row ready for organizer attestation review.',
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
      details: 'Pending conflict resolution before final review.',
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
  } = {},
): Promise<OrganizerResultsRow[]> {
  const allowFallback = options.allowFallback ?? true;
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
    return allowFallback ? getFallbackRowsForLane(lane) : [];
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
    return allowFallback ? getFallbackRowsForLane(lane) : [];
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
          : 'Draft result row available in organizer workflow.';

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
): OrganizerDraftReviewSummary {
  const issues: OrganizerDraftReviewIssue[] = [];
  const validationStateByRowId: Record<string, ResultsValidationState> = {};

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
        message: 'Conflict resolution is still required for this draft row.',
        guidance: 'Resolve the explicit sync conflict before attempting finalization.',
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
        message: 'This row is still pending synchronization.',
        guidance: 'Run deterministic sync until pending rows reach synced state.',
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
        message: 'Finish status row is missing a finish time.',
        guidance: 'Provide a valid finish time before continuing to finalization.',
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
        message: 'Non-finish status row still includes a finish time value.',
        guidance: 'Confirm the status/time combination is intentional before attestation.',
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
  lane: OrganizerResultsLane,
): SafeNextDetailsFeedback[] {
  if (lane === 'capture') {
    return [
      {
        id: 'capture-sync-interrupted',
        tone: 'warning',
        safe: 'Captured rows stay in Draft and are saved locally.',
        next: 'Reconnect and run sync to upload pending entries.',
        details: [
          '2 rows are waiting for sync.',
          'No public or official records were changed.',
        ],
      },
    ];
  }

  if (lane === 'import') {
    return [
      {
        id: 'import-validation',
        tone: 'danger',
        safe: 'Draft import is protected and not public yet.',
        next: 'Fix blockers, then re-run import preview.',
        details: [
          'One duplicate bib needs explicit conflict resolution.',
          'Warnings are listed separately and do not publish data.',
        ],
      },
    ];
  }

  return [
    {
      id: 'review-conflict',
      tone: 'warning',
      safe: 'Official output is still protected while this draft is under review.',
      next: 'Resolve remaining conflicts before attestation.',
      details: [
        '1 row requires conflict confirmation.',
        'Review surface shows latest draft-only state for all rows.',
      ],
    },
  ];
}
