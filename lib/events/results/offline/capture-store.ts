import {
  normalizeResultStatus,
  parseResultFinishTimeToMillis,
} from '@/lib/events/results/ingestion/validation';
import { deriveResultPlacements } from '@/lib/events/results/derivation/placement';
import type { ResultEntryStatus } from '@/lib/events/results/types';

export type OfflineCaptureStatus = ResultEntryStatus;
export type OfflineCaptureSyncStatus = 'pending_sync' | 'synced' | 'conflict';

export type OfflineCaptureSyncCheckpoint = {
  syncedEntryIds: string[];
  lastProcessedEntryId: string | null;
  updatedAt: string | null;
};

export type OfflineCaptureConflictResolutionChoice = 'keep_local' | 'keep_server';

export type OfflineCaptureSyncConflictSnapshot = {
  bibNumber: string;
  status: OfflineCaptureStatus;
  finishTimeInput: string;
  finishTimeMillis: number | null;
  updatedAt: string;
};

export type OfflineCaptureSyncConflictResolution = {
  choice: OfflineCaptureConflictResolutionChoice;
  resolvedAt: string;
  resolvedBy: {
    label: string;
    sessionId: string;
    deviceLabel: string;
  };
};

export type OfflineCaptureSyncConflict = {
  id: string;
  entryId: string;
  detectedAt: string;
  local: OfflineCaptureSyncConflictSnapshot;
  server: OfflineCaptureSyncConflictSnapshot & {
    entryId: string | null;
  };
  resolution: OfflineCaptureSyncConflictResolution | null;
  finalizedAt: string | null;
};

export type OfflineCaptureEntry = {
  id: string;
  bibNumber: string;
  status: OfflineCaptureStatus;
  finishTimeInput: string;
  finishTimeMillis: number | null;
  syncStatus: OfflineCaptureSyncStatus;
  capturedAt: string;
  updatedAt: string;
  provenance: {
    sessionId: string;
    deviceLabel: string;
    editorLabel: string;
  };
};

export type OfflineCaptureStore = {
  version: 1;
  sessionId: string;
  deviceLabel: string;
  editorLabel: string;
  syncCheckpoint: OfflineCaptureSyncCheckpoint;
  syncConflicts: OfflineCaptureSyncConflict[];
  entries: OfflineCaptureEntry[];
};

export type OfflineCapturePreviewRow = {
  id: string;
  rowNumber: number;
  bibNumber: string;
  status: OfflineCaptureStatus;
  finishTimeInput: string;
  finishTimeMillis: number | null;
  capturedAt: string;
  derivedOverallPlace: number | null;
};

export type OfflineCaptureCreateErrorCode = 'bib_required' | 'finish_time_invalid';

export type OfflineCaptureCreateResult =
  | {
      ok: true;
      entry: OfflineCaptureEntry;
    }
  | {
      ok: false;
      code: OfflineCaptureCreateErrorCode;
    };

const STORE_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toStatus(value: unknown): OfflineCaptureStatus | null {
  if (value === 'finish' || value === 'dnf' || value === 'dns' || value === 'dq') {
    return value;
  }
  return null;
}

function toSyncStatus(value: unknown): OfflineCaptureSyncStatus | null {
  if (value === 'pending_sync' || value === 'synced' || value === 'conflict') {
    return value;
  }
  return null;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createOfflineCaptureSessionId(): string {
  return createId('capture-session');
}

export function getBrowserDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'unknown-device';

  const platform =
    typeof navigator.platform === 'string' ? navigator.platform.trim() : '';
  return platform || 'browser-device';
}

export function createEmptyOfflineCaptureStore(params?: {
  sessionId?: string;
  deviceLabel?: string;
  editorLabel?: string;
}): OfflineCaptureStore {
  return {
    version: STORE_VERSION,
    sessionId: params?.sessionId ?? createOfflineCaptureSessionId(),
    deviceLabel: params?.deviceLabel ?? getBrowserDeviceLabel(),
    editorLabel: params?.editorLabel ?? 'organizer',
    syncCheckpoint: createEmptyOfflineSyncCheckpoint(),
    syncConflicts: [],
    entries: [],
  };
}

export function createEmptyOfflineSyncCheckpoint(): OfflineCaptureSyncCheckpoint {
  return {
    syncedEntryIds: [],
    lastProcessedEntryId: null,
    updatedAt: null,
  };
}

function coerceEntry(value: unknown): OfflineCaptureEntry | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : null;
  const bibNumber =
    typeof value.bibNumber === 'string' && value.bibNumber.trim().length > 0
      ? value.bibNumber.trim()
      : null;
  const status = toStatus(value.status);
  const finishTimeInput =
    typeof value.finishTimeInput === 'string' ? value.finishTimeInput.trim() : '';
  const finishTimeMillis =
    typeof value.finishTimeMillis === 'number' && Number.isFinite(value.finishTimeMillis)
      ? Math.max(0, Math.floor(value.finishTimeMillis))
      : null;
  const syncStatus = toSyncStatus(value.syncStatus) ?? 'pending_sync';
  const capturedAt = toIsoDate(value.capturedAt);
  const updatedAt = toIsoDate(value.updatedAt) ?? capturedAt;

  const provenance = isRecord(value.provenance) ? value.provenance : {};
  const sessionId =
    typeof provenance.sessionId === 'string' && provenance.sessionId.trim().length > 0
      ? provenance.sessionId
      : null;
  const deviceLabel =
    typeof provenance.deviceLabel === 'string' && provenance.deviceLabel.trim().length > 0
      ? provenance.deviceLabel
      : null;
  const editorLabel =
    typeof provenance.editorLabel === 'string' && provenance.editorLabel.trim().length > 0
      ? provenance.editorLabel
      : null;

  if (!id || !bibNumber || !status || !capturedAt || !updatedAt || !sessionId || !deviceLabel || !editorLabel) {
    return null;
  }

  return {
    id,
    bibNumber,
    status,
    finishTimeInput,
    finishTimeMillis: status === 'finish' ? finishTimeMillis : null,
    syncStatus,
    capturedAt,
    updatedAt,
    provenance: {
      sessionId,
      deviceLabel,
      editorLabel,
    },
  };
}

function coerceConflictSnapshot(value: unknown): OfflineCaptureSyncConflictSnapshot | null {
  if (!isRecord(value)) return null;

  const bibNumber =
    typeof value.bibNumber === 'string' && value.bibNumber.trim().length > 0
      ? value.bibNumber.trim()
      : null;
  const status = toStatus(value.status);
  const finishTimeInput =
    typeof value.finishTimeInput === 'string' ? value.finishTimeInput.trim() : '';
  const finishTimeMillis =
    typeof value.finishTimeMillis === 'number' && Number.isFinite(value.finishTimeMillis)
      ? Math.max(0, Math.floor(value.finishTimeMillis))
      : null;
  const updatedAt = toIsoDate(value.updatedAt);

  if (!bibNumber || !status || !updatedAt) return null;

  return {
    bibNumber,
    status,
    finishTimeInput,
    finishTimeMillis,
    updatedAt,
  };
}

function coerceConflictResolution(
  value: unknown,
): OfflineCaptureSyncConflictResolution | null {
  if (!isRecord(value)) return null;

  const choice =
    value.choice === 'keep_local' || value.choice === 'keep_server' ? value.choice : null;
  const resolvedAt = toIsoDate(value.resolvedAt);
  const resolvedBy = isRecord(value.resolvedBy) ? value.resolvedBy : {};
  const label =
    typeof resolvedBy.label === 'string' && resolvedBy.label.trim().length > 0
      ? resolvedBy.label.trim()
      : null;
  const sessionId =
    typeof resolvedBy.sessionId === 'string' && resolvedBy.sessionId.trim().length > 0
      ? resolvedBy.sessionId.trim()
      : null;
  const deviceLabel =
    typeof resolvedBy.deviceLabel === 'string' && resolvedBy.deviceLabel.trim().length > 0
      ? resolvedBy.deviceLabel.trim()
      : null;

  if (!choice || !resolvedAt || !label || !sessionId || !deviceLabel) return null;

  return {
    choice,
    resolvedAt,
    resolvedBy: {
      label,
      sessionId,
      deviceLabel,
    },
  };
}

function coerceConflict(value: unknown): OfflineCaptureSyncConflict | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' && value.id.trim().length > 0 ? value.id.trim() : null;
  const entryId =
    typeof value.entryId === 'string' && value.entryId.trim().length > 0
      ? value.entryId.trim()
      : null;
  const detectedAt = toIsoDate(value.detectedAt);
  const local = coerceConflictSnapshot(value.local);
  const serverBase = coerceConflictSnapshot(value.server);
  const serverRecord = isRecord(value.server) ? value.server : {};
  const serverEntryId =
    typeof serverRecord.entryId === 'string' && serverRecord.entryId.trim().length > 0
      ? serverRecord.entryId.trim()
      : null;
  const resolution = coerceConflictResolution(value.resolution);
  const finalizedAt = toIsoDate(value.finalizedAt);

  if (!id || !entryId || !detectedAt || !local || !serverBase) return null;

  return {
    id,
    entryId,
    detectedAt,
    local,
    server: {
      ...serverBase,
      entryId: serverEntryId,
    },
    resolution,
    finalizedAt,
  };
}

function coerceStore(value: unknown): OfflineCaptureStore | null {
  if (!isRecord(value)) return null;

  const version = typeof value.version === 'number' ? value.version : null;
  if (version !== STORE_VERSION) return null;

  const sessionId =
    typeof value.sessionId === 'string' && value.sessionId.trim().length > 0
      ? value.sessionId
      : createOfflineCaptureSessionId();
  const deviceLabel =
    typeof value.deviceLabel === 'string' && value.deviceLabel.trim().length > 0
      ? value.deviceLabel
      : getBrowserDeviceLabel();
  const editorLabel =
    typeof value.editorLabel === 'string' && value.editorLabel.trim().length > 0
      ? value.editorLabel
      : 'organizer';
  const syncCheckpointSource = isRecord(value.syncCheckpoint) ? value.syncCheckpoint : {};
  const syncedEntryIds = Array.isArray(syncCheckpointSource.syncedEntryIds)
    ? syncCheckpointSource.syncedEntryIds.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      )
    : [];
  const lastProcessedEntryId =
    typeof syncCheckpointSource.lastProcessedEntryId === 'string' &&
    syncCheckpointSource.lastProcessedEntryId.trim().length > 0
      ? syncCheckpointSource.lastProcessedEntryId
      : null;
  const checkpointUpdatedAt = toIsoDate(syncCheckpointSource.updatedAt) ?? null;
  const entries = Array.isArray(value.entries)
    ? value.entries.map(coerceEntry).filter((entry): entry is OfflineCaptureEntry => entry !== null)
    : [];
  const syncConflicts = Array.isArray(value.syncConflicts)
    ? value.syncConflicts
        .map(coerceConflict)
        .filter((conflict): conflict is OfflineCaptureSyncConflict => conflict !== null)
    : [];

  return {
    version: STORE_VERSION,
    sessionId,
    deviceLabel,
    editorLabel,
    syncCheckpoint: {
      syncedEntryIds: [...new Set(syncedEntryIds)],
      lastProcessedEntryId,
      updatedAt: checkpointUpdatedAt,
    },
    syncConflicts,
    entries,
  };
}

export function loadOfflineCaptureStore(
  storageKey: string,
  defaults?: {
    sessionId?: string;
    deviceLabel?: string;
    editorLabel?: string;
  },
): OfflineCaptureStore {
  const fallbackStore = createEmptyOfflineCaptureStore(defaults);

  if (typeof window === 'undefined') {
    return fallbackStore;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return fallbackStore;
    }

    const parsed = JSON.parse(rawValue) as unknown;
    const coerced = coerceStore(parsed);
    if (!coerced) {
      return fallbackStore;
    }

    return {
      ...coerced,
      sessionId: defaults?.sessionId ?? coerced.sessionId,
      deviceLabel: defaults?.deviceLabel ?? coerced.deviceLabel,
      editorLabel: defaults?.editorLabel ?? coerced.editorLabel,
      syncCheckpoint: coerced.syncCheckpoint ?? createEmptyOfflineSyncCheckpoint(),
      syncConflicts: Array.isArray(coerced.syncConflicts) ? coerced.syncConflicts : [],
    };
  } catch {
    return fallbackStore;
  }
}

export function persistOfflineCaptureStore(storageKey: string, store: OfflineCaptureStore): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify(store));
}

export function createOfflineCaptureEntry(params: {
  bibNumber: string;
  finishTimeInput: string;
  status: OfflineCaptureStatus;
  sessionId: string;
  deviceLabel: string;
  editorLabel: string;
}): OfflineCaptureCreateResult {
  const bibNumber = params.bibNumber.trim();
  if (!bibNumber) {
    return {
      ok: false,
      code: 'bib_required',
    };
  }

  const normalizedStatus = normalizeResultStatus(params.status);
  const status: OfflineCaptureStatus = normalizedStatus ?? 'finish';
  const finishTimeInput = params.finishTimeInput.trim();
  const parsedFinishTime =
    finishTimeInput.length > 0 ? parseResultFinishTimeToMillis(finishTimeInput) : null;

  if (status === 'finish' && parsedFinishTime === null) {
    return {
      ok: false,
      code: 'finish_time_invalid',
    };
  }

  const now = new Date().toISOString();
  return {
    ok: true,
    entry: {
      id: createId('capture-entry'),
      bibNumber,
      status,
      finishTimeInput,
      finishTimeMillis: status === 'finish' ? parsedFinishTime : null,
      syncStatus: 'pending_sync',
      capturedAt: now,
      updatedAt: now,
      provenance: {
        sessionId: params.sessionId,
        deviceLabel: params.deviceLabel,
        editorLabel: params.editorLabel,
      },
    },
  };
}

export function getOfflinePendingSyncCount(entries: readonly OfflineCaptureEntry[]): number {
  return entries.filter(
    (entry) => entry.syncStatus === 'pending_sync' || entry.syncStatus === 'conflict',
  ).length;
}

export function deriveOfflineCapturePreviewRows(
  entries: readonly OfflineCaptureEntry[],
): OfflineCapturePreviewRow[] {
  const previewRows = entries.map((entry, index) => ({
    id: entry.id,
    rowNumber: index + 1,
    bibNumber: entry.bibNumber,
    status: entry.status,
    finishTimeInput: entry.finishTimeInput,
    finishTimeMillis: entry.finishTimeMillis,
    capturedAt: entry.capturedAt,
    derivedOverallPlace: null as number | null,
  }));

  const placementDerivation = deriveResultPlacements(
    previewRows.map((row) => ({
      id: row.id,
      runnerFullName: row.bibNumber,
      bibNumber: row.bibNumber,
      status: row.status,
      finishTimeMillis: row.finishTimeMillis,
      gender: null,
      age: null,
    })),
  );

  for (const row of previewRows) {
    row.derivedOverallPlace = placementDerivation.byEntryId[row.id]?.overallPlace ?? null;
  }

  return previewRows;
}
