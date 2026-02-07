import {
  createEmptyOfflineSyncCheckpoint,
  type OfflineCaptureEntry,
  type OfflineCaptureStatus,
  type OfflineCaptureSyncConflict,
  type OfflineCaptureSyncConflictResolution,
  type OfflineCaptureSyncCheckpoint,
} from './capture-store';

export type OfflineSyncConflictResolutionInput = {
  conflictId: string;
  choice: 'keep_local' | 'keep_server';
  actor: {
    label: string;
    sessionId: string;
    deviceLabel: string;
  };
  resolvedAt?: string;
};

export type OfflineSyncServerEntry = {
  id: string;
  entryId?: string | null;
  bibNumber: string;
  status: OfflineCaptureStatus;
  finishTimeMillis: number | null;
  finishTimeInput?: string;
  updatedAt: string;
};

type ResolvedServerBaseline = {
  id: string | null;
  entryId: string | null;
  bibNumber: string;
  status: OfflineCaptureStatus;
  finishTimeMillis: number | null;
  finishTimeInput: string;
  updatedAt: string;
};

export type DeterministicOfflineSyncResult = {
  entries: OfflineCaptureEntry[];
  checkpoint: OfflineCaptureSyncCheckpoint;
  conflicts: OfflineCaptureSyncConflict[];
  processedCount: number;
  skippedCount: number;
  remainingCount: number;
  unresolvedConflictCount: number;
  blockedByConflicts: boolean;
  interrupted: boolean;
};

function toStableSortTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createConflictId(entryId: string, serverRef: string): string {
  const normalizedServerRef = serverRef.replace(/[^a-zA-Z0-9-_]/g, '-');
  return `sync-conflict-${entryId}-${normalizedServerRef}`;
}

function toServerBaselineFromEntry(entry: OfflineCaptureEntry): ResolvedServerBaseline {
  return {
    id: null,
    entryId: entry.id,
    bibNumber: entry.bibNumber,
    status: entry.status,
    finishTimeMillis: entry.finishTimeMillis,
    finishTimeInput: entry.finishTimeInput,
    updatedAt: entry.updatedAt,
  };
}

function toConflictSnapshotFromEntry(entry: OfflineCaptureEntry) {
  return {
    bibNumber: entry.bibNumber,
    status: entry.status,
    finishTimeInput: entry.finishTimeInput,
    finishTimeMillis: entry.finishTimeMillis,
    updatedAt: entry.updatedAt,
  };
}

function toConflictSnapshotFromServer(server: ResolvedServerBaseline) {
  return {
    bibNumber: server.bibNumber,
    status: server.status,
    finishTimeInput: server.finishTimeInput,
    finishTimeMillis: server.finishTimeMillis,
    updatedAt: server.updatedAt,
  };
}

function toConflictResolution(
  resolution: OfflineSyncConflictResolutionInput,
): OfflineCaptureSyncConflictResolution {
  return {
    choice: resolution.choice,
    resolvedAt: resolution.resolvedAt ?? new Date().toISOString(),
    resolvedBy: {
      label: resolution.actor.label,
      sessionId: resolution.actor.sessionId,
      deviceLabel: resolution.actor.deviceLabel,
    },
  };
}

function isConflict(entry: OfflineCaptureEntry, server: ResolvedServerBaseline): boolean {
  return (
    entry.status !== server.status ||
    entry.finishTimeMillis !== server.finishTimeMillis
  );
}

function mergeServerBaseline(
  map: Map<string, ResolvedServerBaseline>,
  candidate: ResolvedServerBaseline,
): void {
  const key = candidate.bibNumber.trim();
  if (!key) return;

  const current = map.get(key);
  if (!current) {
    map.set(key, candidate);
    return;
  }

  const currentTime = toStableSortTimestamp(current.updatedAt);
  const candidateTime = toStableSortTimestamp(candidate.updatedAt);
  if (candidateTime >= currentTime) {
    map.set(key, candidate);
  }
}

export function runDeterministicOfflineSync(params: {
  entries: readonly OfflineCaptureEntry[];
  checkpoint?: OfflineCaptureSyncCheckpoint;
  existingConflicts?: readonly OfflineCaptureSyncConflict[];
  conflictResolutions?: readonly OfflineSyncConflictResolutionInput[];
  serverEntries?: readonly OfflineSyncServerEntry[];
  maxBatchSize?: number;
}): DeterministicOfflineSyncResult {
  const checkpoint = params.checkpoint ?? createEmptyOfflineSyncCheckpoint();
  const maxBatchSize =
    typeof params.maxBatchSize === 'number' && params.maxBatchSize > 0
      ? Math.floor(params.maxBatchSize)
      : Number.MAX_SAFE_INTEGER;

  const syncedEntryIds = new Set(checkpoint.syncedEntryIds);
  const stableOrderIds = [...params.entries]
    .sort((left, right) => {
      const leftTime = toStableSortTimestamp(left.capturedAt);
      const rightTime = toStableSortTimestamp(right.capturedAt);
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.id.localeCompare(right.id);
    })
    .map((entry) => entry.id);

  const sortedEntryLookup = new Map(params.entries.map((entry) => [entry.id, entry]));
  const existingConflicts = params.existingConflicts ?? [];
  const conflictById = new Map(existingConflicts.map((conflict) => [conflict.id, conflict]));
  const conflictByEntryId = new Map(
    existingConflicts.map((conflict) => [conflict.entryId, conflict]),
  );
  const conflictResolutionById = new Map(
    (params.conflictResolutions ?? []).map((resolution) => [resolution.conflictId, resolution]),
  );
  const serverByBib = new Map<string, ResolvedServerBaseline>();
  for (const entry of params.entries) {
    if (entry.syncStatus === 'synced') {
      mergeServerBaseline(serverByBib, toServerBaselineFromEntry(entry));
    }
  }

  for (const serverEntry of params.serverEntries ?? []) {
    const bibNumber = serverEntry.bibNumber.trim();
    if (!bibNumber) continue;
    mergeServerBaseline(serverByBib, {
      id: serverEntry.id,
      entryId: serverEntry.entryId ?? null,
      bibNumber,
      status: serverEntry.status,
      finishTimeMillis: serverEntry.finishTimeMillis,
      finishTimeInput: serverEntry.finishTimeInput ?? '',
      updatedAt: serverEntry.updatedAt,
    });
  }

  let processedCount = 0;
  let skippedCount = 0;
  let lastProcessedEntryId = checkpoint.lastProcessedEntryId;
  const now = new Date().toISOString();
  const nextEntriesById = new Map<string, OfflineCaptureEntry>();

  for (const entryId of stableOrderIds) {
    const entry = sortedEntryLookup.get(entryId);
    if (!entry) continue;
    if (entry.syncStatus === 'synced') continue;
    if (entry.syncStatus !== 'pending_sync' && entry.syncStatus !== 'conflict') continue;

    if (syncedEntryIds.has(entry.id)) {
      skippedCount += 1;
      nextEntriesById.set(entry.id, {
        ...entry,
        syncStatus: 'synced',
        updatedAt: now,
      });
      continue;
    }

    const normalizedBib = entry.bibNumber.trim();
    const serverBaseline =
      normalizedBib.length > 0 ? serverByBib.get(normalizedBib) : undefined;

    if (serverBaseline && isConflict(entry, serverBaseline)) {
      const existingConflict = conflictByEntryId.get(entry.id);
      const conflictId =
        existingConflict?.id ??
        createConflictId(entry.id, serverBaseline.entryId ?? serverBaseline.id ?? 'server');
      const requestedResolution = conflictResolutionById.get(conflictId);
      const resolvedDecision = requestedResolution
        ? toConflictResolution(requestedResolution)
        : existingConflict?.resolution ?? null;

      const nextConflict: OfflineCaptureSyncConflict = {
        id: conflictId,
        entryId: entry.id,
        detectedAt: existingConflict?.detectedAt ?? now,
        local: toConflictSnapshotFromEntry(entry),
        server: {
          ...toConflictSnapshotFromServer(serverBaseline),
          entryId: serverBaseline.entryId,
        },
        resolution: resolvedDecision,
        finalizedAt: existingConflict?.finalizedAt ?? null,
      };

      if (!resolvedDecision) {
        conflictById.set(conflictId, { ...nextConflict, finalizedAt: null });
        conflictByEntryId.set(entry.id, { ...nextConflict, finalizedAt: null });
        nextEntriesById.set(entry.id, {
          ...entry,
          syncStatus: 'conflict',
        });
        continue;
      }

      if (processedCount >= maxBatchSize) {
        conflictById.set(conflictId, { ...nextConflict, finalizedAt: null });
        conflictByEntryId.set(entry.id, { ...nextConflict, finalizedAt: null });
        continue;
      }

      processedCount += 1;
      syncedEntryIds.add(entry.id);
      lastProcessedEntryId = entry.id;

      const finalizedEntry: OfflineCaptureEntry =
        resolvedDecision.choice === 'keep_server'
          ? {
              ...entry,
              status: serverBaseline.status,
              finishTimeInput: serverBaseline.finishTimeInput,
              finishTimeMillis: serverBaseline.finishTimeMillis,
              syncStatus: 'synced',
              updatedAt: now,
            }
          : {
              ...entry,
              syncStatus: 'synced',
              updatedAt: now,
            };

      nextEntriesById.set(entry.id, finalizedEntry);
      mergeServerBaseline(serverByBib, toServerBaselineFromEntry(finalizedEntry));
      const finalizedConflict = {
        ...nextConflict,
        finalizedAt: now,
      };
      conflictById.set(conflictId, finalizedConflict);
      conflictByEntryId.set(entry.id, finalizedConflict);
      continue;
    }

    const staleConflict = conflictByEntryId.get(entry.id);
    if (staleConflict && staleConflict.finalizedAt === null) {
      conflictById.delete(staleConflict.id);
      conflictByEntryId.delete(entry.id);
    }

    if (processedCount >= maxBatchSize) break;

    processedCount += 1;
    syncedEntryIds.add(entry.id);
    lastProcessedEntryId = entry.id;
    const syncedEntry = {
      ...entry,
      syncStatus: 'synced' as const,
      updatedAt: now,
    };
    nextEntriesById.set(entry.id, syncedEntry);
    mergeServerBaseline(serverByBib, toServerBaselineFromEntry(syncedEntry));
  }

  const nextEntries = params.entries.map((entry) => {
    const updatedEntry = nextEntriesById.get(entry.id);
    if (updatedEntry) return updatedEntry;
    if (!syncedEntryIds.has(entry.id)) return entry;
    if (entry.syncStatus === 'synced') return entry;
    return {
      ...entry,
      syncStatus: 'synced' as const,
      updatedAt: now,
    };
  });

  const conflicts = [...conflictById.values()].sort((left, right) => {
    const leftTime = toStableSortTimestamp(left.detectedAt);
    const rightTime = toStableSortTimestamp(right.detectedAt);
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.id.localeCompare(right.id);
  });
  const unresolvedConflictCount = conflicts.filter((conflict) => conflict.finalizedAt === null).length;
  const pendingCount = nextEntries.filter((entry) => entry.syncStatus === 'pending_sync').length;
  const remainingCount = pendingCount + unresolvedConflictCount;
  const blockedByConflicts = unresolvedConflictCount > 0;
  const nextCheckpoint: OfflineCaptureSyncCheckpoint = {
    syncedEntryIds: [...syncedEntryIds],
    lastProcessedEntryId,
    updatedAt: processedCount > 0 || skippedCount > 0 ? now : checkpoint.updatedAt,
  };

  return {
    entries: nextEntries,
    checkpoint: nextCheckpoint,
    conflicts,
    processedCount,
    skippedCount,
    remainingCount,
    unresolvedConflictCount,
    blockedByConflicts,
    interrupted: remainingCount > 0,
  };
}
