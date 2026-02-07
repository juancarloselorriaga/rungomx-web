import {
  createEmptyOfflineSyncCheckpoint,
  type OfflineCaptureEntry,
} from '@/lib/events/results/offline/capture-store';
import { runDeterministicOfflineSync } from '@/lib/events/results/offline/sync-engine';

function createEntry(params: {
  id: string;
  capturedAt: string;
  bibNumber?: string;
  finishTimeMillis?: number | null;
  syncStatus?: 'pending_sync' | 'synced' | 'conflict';
}): OfflineCaptureEntry {
  return {
    id: params.id,
    bibNumber: params.bibNumber ?? params.id,
    status: 'finish',
    finishTimeInput: '00:30:00',
    finishTimeMillis: params.finishTimeMillis ?? 1800000,
    syncStatus: params.syncStatus ?? 'pending_sync',
    capturedAt: params.capturedAt,
    updatedAt: params.capturedAt,
    provenance: {
      sessionId: 'session-1',
      deviceLabel: 'device-1',
      editorLabel: 'organizer',
    },
  };
}

describe('runDeterministicOfflineSync', () => {
  it('skips already-synced ids and does not duplicate writes', () => {
    const entries: OfflineCaptureEntry[] = [
      createEntry({ id: 'entry-1', capturedAt: '2026-02-07T12:00:00.000Z' }),
      createEntry({ id: 'entry-2', capturedAt: '2026-02-07T12:01:00.000Z' }),
      createEntry({ id: 'entry-3', capturedAt: '2026-02-07T12:02:00.000Z' }),
    ];

    const result = runDeterministicOfflineSync({
      entries,
      checkpoint: {
        syncedEntryIds: ['entry-1'],
        lastProcessedEntryId: 'entry-1',
        updatedAt: '2026-02-07T12:10:00.000Z',
      },
      maxBatchSize: 2,
    });

    expect(result.skippedCount).toBe(1);
    expect(result.processedCount).toBe(2);
    expect(result.remainingCount).toBe(0);
    expect(result.interrupted).toBe(false);
    expect(
      result.entries.every((entry) => entry.syncStatus === 'synced'),
    ).toBeTruthy();
  });

  it('continues from checkpoint on retry after interruption', () => {
    const entries: OfflineCaptureEntry[] = [
      createEntry({ id: 'entry-a', capturedAt: '2026-02-07T12:00:00.000Z' }),
      createEntry({ id: 'entry-b', capturedAt: '2026-02-07T12:01:00.000Z' }),
      createEntry({ id: 'entry-c', capturedAt: '2026-02-07T12:02:00.000Z' }),
      createEntry({ id: 'entry-d', capturedAt: '2026-02-07T12:03:00.000Z' }),
    ];

    const firstPass = runDeterministicOfflineSync({
      entries,
      checkpoint: createEmptyOfflineSyncCheckpoint(),
      maxBatchSize: 2,
    });

    expect(firstPass.processedCount).toBe(2);
    expect(firstPass.remainingCount).toBe(2);
    expect(firstPass.interrupted).toBe(true);

    const retryPass = runDeterministicOfflineSync({
      entries: firstPass.entries,
      checkpoint: firstPass.checkpoint,
      maxBatchSize: 2,
    });

    expect(retryPass.processedCount).toBe(2);
    expect(retryPass.remainingCount).toBe(0);
    expect(retryPass.interrupted).toBe(false);
    expect(
      retryPass.entries.every((entry) => entry.syncStatus === 'synced'),
    ).toBeTruthy();
  });

  it('detects unresolved conflicts and blocks completion until an explicit decision exists', () => {
    const entries: OfflineCaptureEntry[] = [
      createEntry({
        id: 'entry-conflict',
        bibNumber: '501',
        finishTimeMillis: 1_800_000,
        capturedAt: '2026-02-07T12:00:00.000Z',
      }),
      createEntry({
        id: 'entry-clean',
        bibNumber: '502',
        finishTimeMillis: 1_900_000,
        capturedAt: '2026-02-07T12:01:00.000Z',
      }),
    ];

    const result = runDeterministicOfflineSync({
      entries,
      checkpoint: createEmptyOfflineSyncCheckpoint(),
      maxBatchSize: 5,
      serverEntries: [
        {
          id: 'server-501',
          bibNumber: '501',
          status: 'finish',
          finishTimeMillis: 1_750_000,
          finishTimeInput: '00:29:10',
          updatedAt: '2026-02-07T11:59:00.000Z',
        },
      ],
    });

    expect(result.blockedByConflicts).toBe(true);
    expect(result.unresolvedConflictCount).toBe(1);
    expect(result.remainingCount).toBe(1);
    expect(result.processedCount).toBe(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.entryId).toBe('entry-conflict');
    expect(result.conflicts[0]?.resolution).toBeNull();
    expect(
      result.entries.find((entry) => entry.id === 'entry-conflict')?.syncStatus,
    ).toBe('conflict');
    expect(
      result.entries.find((entry) => entry.id === 'entry-clean')?.syncStatus,
    ).toBe('synced');
  });

  it('finalizes conflicts after explicit resolution and persists audit metadata', () => {
    const entries: OfflineCaptureEntry[] = [
      createEntry({
        id: 'entry-conflict',
        bibNumber: '601',
        finishTimeMillis: 1_800_000,
        capturedAt: '2026-02-07T12:00:00.000Z',
      }),
    ];

    const firstPass = runDeterministicOfflineSync({
      entries,
      checkpoint: createEmptyOfflineSyncCheckpoint(),
      serverEntries: [
        {
          id: 'server-601',
          bibNumber: '601',
          status: 'finish',
          finishTimeMillis: 1_730_000,
          finishTimeInput: '00:28:50',
          updatedAt: '2026-02-07T11:59:00.000Z',
        },
      ],
    });

    const [detectedConflict] = firstPass.conflicts;
    expect(detectedConflict).toBeDefined();

    const secondPass = runDeterministicOfflineSync({
      entries: firstPass.entries,
      checkpoint: firstPass.checkpoint,
      existingConflicts: firstPass.conflicts,
      serverEntries: [
        {
          id: 'server-601',
          bibNumber: '601',
          status: 'finish',
          finishTimeMillis: 1_730_000,
          finishTimeInput: '00:28:50',
          updatedAt: '2026-02-07T11:59:00.000Z',
        },
      ],
      conflictResolutions: [
        {
          conflictId: detectedConflict!.id,
          choice: 'keep_server',
          actor: {
            label: 'organizer',
            sessionId: 'session-9',
            deviceLabel: 'device-9',
          },
          resolvedAt: '2026-02-07T12:05:00.000Z',
        },
      ],
    });

    expect(secondPass.blockedByConflicts).toBe(false);
    expect(secondPass.unresolvedConflictCount).toBe(0);
    expect(secondPass.remainingCount).toBe(0);
    expect(secondPass.processedCount).toBe(1);
    expect(secondPass.conflicts[0]?.resolution?.choice).toBe('keep_server');
    expect(secondPass.conflicts[0]?.resolution?.resolvedBy.sessionId).toBe('session-9');
    expect(secondPass.conflicts[0]?.finalizedAt).not.toBeNull();
    expect(secondPass.entries[0]?.syncStatus).toBe('synced');
    expect(secondPass.entries[0]?.finishTimeMillis).toBe(1_730_000);
  });
});
