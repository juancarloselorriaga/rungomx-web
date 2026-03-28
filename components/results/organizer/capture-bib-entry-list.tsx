'use client';

import { SafeNextDetailsMessage } from '@/components/results/primitives/safe-next-details-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InsetSurface, MutedSurface, Surface } from '@/components/ui/surface';
import { TimeInput } from '@/components/ui/time-input';
import { Link } from '@/i18n/navigation';
import {
  createEmptyOfflineCaptureStore,
  createOfflineCaptureEntry,
  deriveOfflineCapturePreviewRows,
  getOfflinePendingSyncCount,
  loadOfflineCaptureStore,
  persistOfflineCaptureStore,
  type OfflineCaptureSyncConflict,
  type OfflineCaptureStore,
  type OfflineCaptureStatus,
} from '@/lib/events/results/offline/capture-store';
import { runDeterministicOfflineSync } from '@/lib/events/results/offline/sync-engine';
import { cn } from '@/lib/utils';
import { CloudOff, Wifi } from 'lucide-react';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

type CaptureBibEntryListLabels = {
  title: string;
  description: string;
  connectivityLabel: string;
  connectivityOnline: string;
  connectivityOffline: string;
  reassuranceSavedLocally: string;
  reassuranceNotPublic: string;
  reassurancePendingSync: string;
  pendingSyncLabel: string;
  lastSyncLabel: string;
  lastSyncNever: string;
  reviewAction: string;
  bibLabel: string;
  bibPlaceholder: string;
  timeLabel: string;
  timePlaceholder: string;
  statusLabel: string;
  submitAction: string;
  validationBibRequired: string;
  validationFinishTimeInvalid: string;
  entrySaved: string;
  entriesTitle: string;
  entriesDescription: string;
  entriesEmpty: string;
  syncTitle: string;
  syncDescription: string;
  syncAction: string;
  syncOfflineGuard: string;
  syncProgressMessage: string;
  syncCompleteMessage: string;
  syncInterruptedMessage: string;
  syncBlockedByConflicts: string;
  conflictTitle: string;
  conflictDescription: string;
  conflictEmpty: string;
  conflictNeedsDecision: string;
  conflictResolved: string;
  conflictLocalValues: string;
  conflictServerValues: string;
  conflictFieldBib: string;
  conflictFieldStatus: string;
  conflictFieldFinishTime: string;
  conflictFieldUpdatedAt: string;
  conflictActionKeepLocal: string;
  conflictActionKeepServer: string;
  conflictChoiceKeepLocal: string;
  conflictChoiceKeepServer: string;
  headers: {
    bib: string;
    status: string;
    syncStatus: string;
    finishTime: string;
    derivedOverall: string;
    capturedAt: string;
    provenance: string;
  };
  statusOptions: {
    finish: string;
    dnf: string;
    dns: string;
    dq: string;
  };
  provenanceSession: string;
  provenanceDevice: string;
  provenanceEditor: string;
  syncStatusPending: string;
  syncStatusSynced: string;
  syncStatusConflict: string;
  safeNextDetails: {
    safe: string;
    next: string;
    details: string;
    safeMessage: string;
    nextMessage: string;
    detailConflictSummary: string;
    detailDraftProtection: string;
  };
};

type CaptureBibEntryListProps = {
  storageKey: string;
  locale: string;
  labels: CaptureBibEntryListLabels;
  reviewHref?: Parameters<typeof Link>[0]['href'];
};

const STATUS_OPTIONS: OfflineCaptureStatus[] = ['finish', 'dnf', 'dns', 'dq'];
const OFFLINE_CAPTURE_STORE_EVENT = 'results-offline-capture-store-change';

function formatTemplateLabel(template: string, count: number): string {
  return template.replace('{count}', count.toLocaleString());
}

function formatMessage(template: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce(
    (message, [key, value]) => message.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    template,
  );
}

function getStatusLabel(status: OfflineCaptureStatus, labels: CaptureBibEntryListLabels): string {
  switch (status) {
    case 'dnf':
      return labels.statusOptions.dnf;
    case 'dns':
      return labels.statusOptions.dns;
    case 'dq':
      return labels.statusOptions.dq;
    default:
      return labels.statusOptions.finish;
  }
}

function formatTimeForPreview(value: string): string {
  return value.trim() || '-';
}

function getSyncStatusLabel(
  syncStatus: 'pending_sync' | 'synced' | 'conflict',
  labels: CaptureBibEntryListLabels,
): string {
  if (syncStatus === 'synced') return labels.syncStatusSynced;
  if (syncStatus === 'conflict') return labels.syncStatusConflict;
  return labels.syncStatusPending;
}

function getConflictChoiceLabel(
  conflict: OfflineCaptureSyncConflict,
  labels: CaptureBibEntryListLabels,
): string {
  if (!conflict.resolution) return labels.conflictNeedsDecision;
  return conflict.resolution.choice === 'keep_local'
    ? labels.conflictChoiceKeepLocal
    : labels.conflictChoiceKeepServer;
}

export function CaptureBibEntryList({
  storageKey,
  locale,
  labels,
  reviewHref,
}: CaptureBibEntryListProps) {
  const [bibNumber, setBibNumber] = useState('');
  const [finishTimeInput, setFinishTimeInput] = useState('');
  const [status, setStatus] = useState<OfflineCaptureStatus>('finish');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const fallbackStore = useMemo(
    () =>
      createEmptyOfflineCaptureStore({
        sessionId: 'capture-session',
        deviceLabel: 'browser-device',
        editorLabel: 'organizer',
      }),
    [],
  );
  const storeSnapshot = useSyncExternalStore(
    useCallback(
      (onStoreChange) => {
        if (typeof window === 'undefined') return () => undefined;

        const onStorage = (event: StorageEvent) => {
          if (event.key === storageKey) onStoreChange();
        };
        const onCustomStoreChange = (event: Event) => {
          if ((event as CustomEvent<string>).detail === storageKey) onStoreChange();
        };

        window.addEventListener('storage', onStorage);
        window.addEventListener(OFFLINE_CAPTURE_STORE_EVENT, onCustomStoreChange);

        return () => {
          window.removeEventListener('storage', onStorage);
          window.removeEventListener(OFFLINE_CAPTURE_STORE_EVENT, onCustomStoreChange);
        };
      },
      [storageKey],
    ),
    useCallback(() => {
      if (typeof window === 'undefined') return null;
      return window.localStorage.getItem(storageKey);
    }, [storageKey]),
    () => null,
  );
  const store = useMemo(() => {
    if (storeSnapshot === null) return fallbackStore;

    return loadOfflineCaptureStore(storageKey);
  }, [fallbackStore, storageKey, storeSnapshot]);
  const isOnline = useSyncExternalStore(
    useCallback((onOnlineChange) => {
      if (typeof window === 'undefined') return () => undefined;

      window.addEventListener('online', onOnlineChange);
      window.addEventListener('offline', onOnlineChange);

      return () => {
        window.removeEventListener('online', onOnlineChange);
        window.removeEventListener('offline', onOnlineChange);
      };
    }, []),
    () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    () => true,
  );
  const commitStore = useCallback(
    (updater: (current: OfflineCaptureStore) => OfflineCaptureStore) => {
      const nextStore = updater(loadOfflineCaptureStore(storageKey));
      persistOfflineCaptureStore(storageKey, nextStore);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent<string>(OFFLINE_CAPTURE_STORE_EVENT, { detail: storageKey }),
        );
      }
    },
    [storageKey],
  );

  const pendingSyncCount = getOfflinePendingSyncCount(store.entries);
  const previewRows = deriveOfflineCapturePreviewRows(store.entries);
  const latestPreviewRows = [...previewRows].sort((left, right) => {
    const rightTime = Date.parse(right.capturedAt);
    const leftTime = Date.parse(left.capturedAt);
    if (rightTime !== leftTime) return rightTime - leftTime;
    return right.id.localeCompare(left.id);
  });
  const timestampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    [locale],
  );
  const unresolvedConflicts = store.syncConflicts.filter(
    (conflict) => conflict.finalizedAt === null,
  );
  const entryById = new Map(store.entries.map((entry) => [entry.id, entry]));
  const lastSyncLabel = store.syncCheckpoint.updatedAt
    ? timestampFormatter.format(new Date(store.syncCheckpoint.updatedAt))
    : labels.lastSyncNever;

  const onSubmit = () => {
    const result = createOfflineCaptureEntry({
      bibNumber,
      finishTimeInput,
      status,
      sessionId: store.sessionId,
      deviceLabel: store.deviceLabel,
      editorLabel: store.editorLabel,
    });

    if (!result.ok) {
      const message =
        result.code === 'bib_required'
          ? labels.validationBibRequired
          : labels.validationFinishTimeInvalid;
      setErrorMessage(message);
      setFeedbackMessage(null);
      return;
    }

    commitStore((current) => ({
      ...current,
      entries: [...current.entries, result.entry],
    }));
    setBibNumber('');
    setFinishTimeInput('');
    setStatus('finish');
    setErrorMessage(null);
    setFeedbackMessage(labels.entrySaved);
  };

  const onRunSync = () => {
    if (!isOnline) {
      setErrorMessage(labels.syncOfflineGuard);
      setFeedbackMessage(null);
      return;
    }

    const syncResult = runDeterministicOfflineSync({
      entries: store.entries,
      checkpoint: store.syncCheckpoint,
      existingConflicts: store.syncConflicts,
      conflictResolutions: store.syncConflicts
        .filter((conflict) => conflict.finalizedAt === null && conflict.resolution !== null)
        .map((conflict) => ({
          conflictId: conflict.id,
          choice: conflict.resolution!.choice,
          actor: conflict.resolution!.resolvedBy,
          resolvedAt: conflict.resolution!.resolvedAt,
        })),
      maxBatchSize: 3,
    });

    commitStore((current) => ({
      ...current,
      entries: syncResult.entries,
      syncCheckpoint: syncResult.checkpoint,
      syncConflicts: syncResult.conflicts,
    }));

    if (syncResult.blockedByConflicts) {
      setErrorMessage(labels.syncBlockedByConflicts);
      setFeedbackMessage(null);
      return;
    }

    setErrorMessage(null);

    if (syncResult.remainingCount === 0) {
      setFeedbackMessage(labels.syncCompleteMessage);
      return;
    }

    const messageTemplate = syncResult.interrupted
      ? labels.syncInterruptedMessage
      : labels.syncProgressMessage;
    setFeedbackMessage(
      formatMessage(messageTemplate, {
        processed: syncResult.processedCount,
        skipped: syncResult.skippedCount,
        remaining: syncResult.remainingCount,
      }),
    );
  };

  const onResolveConflict = (conflictId: string, choice: 'keep_local' | 'keep_server') => {
    commitStore((current) => ({
      ...current,
      syncConflicts: current.syncConflicts.map((conflict) => {
        if (conflict.id !== conflictId) return conflict;
        return {
          ...conflict,
          resolution: {
            choice,
            resolvedAt: new Date().toISOString(),
            resolvedBy: {
              label: current.editorLabel,
              sessionId: current.sessionId,
              deviceLabel: current.deviceLabel,
            },
          },
          finalizedAt: null,
        };
      }),
    }));
    setErrorMessage(null);
    setFeedbackMessage(
      choice === 'keep_local' ? labels.conflictChoiceKeepLocal : labels.conflictChoiceKeepServer,
    );
  };

  return (
    <Surface className="space-y-0 border-border/60 p-0 shadow-none overflow-hidden">
      {/* Status bar — ambient, not primary */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 px-4 py-3 sm:px-5">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium',
            isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
          )}
        >
          {isOnline ? (
            <Wifi className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <CloudOff className="h-3.5 w-3.5 shrink-0" />
          )}
          {isOnline ? labels.connectivityOnline : labels.connectivityOffline}
        </span>

        <span className="text-xs text-muted-foreground">
          {formatTemplateLabel(labels.reassurancePendingSync, pendingSyncCount)}
        </span>

        <span className="text-xs text-muted-foreground">
          {labels.lastSyncLabel}: {lastSyncLabel}
        </span>

        <div className="ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRunSync}
            className="h-8 text-xs"
          >
            {labels.syncAction}
          </Button>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {/* Entry form — the primary action */}
        <section aria-label={labels.title}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {labels.bibLabel}
              </span>
              <Input
                value={bibNumber}
                onChange={(event) => setBibNumber(event.target.value)}
                inputMode="numeric"
                placeholder={labels.bibPlaceholder}
                className="h-12 text-base font-medium placeholder:font-normal placeholder:text-muted-foreground/60"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {labels.timeLabel}
              </span>
              <TimeInput
                value={finishTimeInput}
                onChange={setFinishTimeInput}
                placeholder={labels.timePlaceholder}
                className="h-12 text-base font-medium placeholder:font-normal placeholder:text-muted-foreground/60"
              />
            </label>
          </div>

          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {labels.statusLabel}
            </p>
            <div
              role="radiogroup"
              aria-label={labels.statusLabel}
              className="flex rounded-xl bg-muted/70 p-1 gap-1"
            >
              {STATUS_OPTIONS.map((option) => {
                const selected = status === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setStatus(option)}
                    className={cn(
                      'flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all',
                      selected
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {getStatusLabel(option, labels)}
                  </button>
                );
              })}
            </div>
          </div>

          {errorMessage ? (
            <p
              className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          {feedbackMessage ? (
            <p className="mt-3 rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
              {feedbackMessage}
            </p>
          ) : null}

          <Button type="button" onClick={onSubmit} className="mt-4 h-11 w-full">
            {labels.submitAction}
          </Button>

          {reviewHref ? (
            <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
              <p className="text-xs text-muted-foreground">{labels.reassuranceNotPublic}</p>
              <Button asChild type="button" variant="ghost" size="sm" className="shrink-0">
                <Link href={reviewHref}>{labels.reviewAction}</Link>
              </Button>
            </div>
          ) : null}
        </section>

        {/* Conflict resolution — inline, shown only when needed */}
        {unresolvedConflicts.length > 0 ? (
          <InsetSurface as="section" className="space-y-3 p-3 sm:p-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground">{labels.conflictTitle}</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">{labels.conflictDescription}</p>
            </div>

            <SafeNextDetailsMessage
              safe={labels.safeNextDetails.safeMessage}
              next={labels.safeNextDetails.nextMessage}
              details={[
                formatTemplateLabel(
                  labels.safeNextDetails.detailConflictSummary,
                  unresolvedConflicts.length,
                ),
                labels.safeNextDetails.detailDraftProtection,
              ]}
              labels={{
                safe: labels.safeNextDetails.safe,
                next: labels.safeNextDetails.next,
                details: labels.safeNextDetails.details,
              }}
              tone="warning"
            />

            <div className="space-y-3">
              {unresolvedConflicts.map((conflict) => {
                const keepLocalSelected = conflict.resolution?.choice === 'keep_local';
                const keepServerSelected = conflict.resolution?.choice === 'keep_server';
                return (
                  <Surface
                    key={conflict.id}
                    as="article"
                    className="space-y-3 rounded-xl p-3 shadow-none"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <MutedSurface className="space-y-1 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {labels.conflictLocalValues}
                        </p>
                        <dl className="space-y-1 text-sm">
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">{labels.conflictFieldBib}</dt>
                            <dd className="font-medium text-foreground">
                              {conflict.local.bibNumber}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">{labels.conflictFieldStatus}</dt>
                            <dd className="font-medium text-foreground">
                              {getStatusLabel(conflict.local.status, labels)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">
                              {labels.conflictFieldFinishTime}
                            </dt>
                            <dd className="font-medium text-foreground">
                              {formatTimeForPreview(conflict.local.finishTimeInput)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">
                              {labels.conflictFieldUpdatedAt}
                            </dt>
                            <dd className="font-medium text-foreground">
                              {timestampFormatter.format(new Date(conflict.local.updatedAt))}
                            </dd>
                          </div>
                        </dl>
                      </MutedSurface>

                      <MutedSurface className="space-y-1 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {labels.conflictServerValues}
                        </p>
                        <dl className="space-y-1 text-sm">
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">{labels.conflictFieldBib}</dt>
                            <dd className="font-medium text-foreground">
                              {conflict.server.bibNumber}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">{labels.conflictFieldStatus}</dt>
                            <dd className="font-medium text-foreground">
                              {getStatusLabel(conflict.server.status, labels)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">
                              {labels.conflictFieldFinishTime}
                            </dt>
                            <dd className="font-medium text-foreground">
                              {formatTimeForPreview(conflict.server.finishTimeInput)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">
                              {labels.conflictFieldUpdatedAt}
                            </dt>
                            <dd className="font-medium text-foreground">
                              {timestampFormatter.format(new Date(conflict.server.updatedAt))}
                            </dd>
                          </div>
                        </dl>
                      </MutedSurface>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={keepLocalSelected ? 'default' : 'outline'}
                        onClick={() => onResolveConflict(conflict.id, 'keep_local')}
                      >
                        {labels.conflictActionKeepLocal}
                      </Button>
                      <Button
                        type="button"
                        variant={keepServerSelected ? 'default' : 'outline'}
                        onClick={() => onResolveConflict(conflict.id, 'keep_server')}
                      >
                        {labels.conflictActionKeepServer}
                      </Button>
                    </div>

                    <p className="text-sm text-foreground">
                      {conflict.resolution
                        ? `${labels.conflictResolved}: ${getConflictChoiceLabel(conflict, labels)}`
                        : labels.conflictNeedsDecision}
                    </p>
                  </Surface>
                );
              })}
            </div>
          </InsetSurface>
        ) : null}

        {/* Entries log */}
        <section>
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-foreground">{labels.entriesTitle}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">{labels.entriesDescription}</p>
          </div>

          {latestPreviewRows.length === 0 ? (
            <p className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
              {labels.entriesEmpty}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-semibold">{labels.headers.bib}</th>
                    <th className="px-3 py-2.5 font-semibold">{labels.headers.status}</th>
                    <th className="px-3 py-2.5 font-semibold">{labels.headers.finishTime}</th>
                    <th className="px-3 py-2.5 font-semibold">{labels.headers.syncStatus}</th>
                    <th className="px-3 py-2.5 font-semibold">{labels.headers.derivedOverall}</th>
                    <th className="px-3 py-2.5 font-semibold">{labels.headers.capturedAt}</th>
                  </tr>
                </thead>
                <tbody>
                  {latestPreviewRows.map((row) => {
                    const source = entryById.get(row.id);
                    return (
                      <tr key={row.id} className="border-b border-border/50 last:border-b-0">
                        <td className="px-3 py-2.5 font-semibold tabular-nums text-foreground">
                          {row.bibNumber}
                        </td>
                        <td className="px-3 py-2.5 text-foreground">
                          {getStatusLabel(row.status, labels)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-foreground">
                          {formatTimeForPreview(row.finishTimeInput)}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {source ? getSyncStatusLabel(source.syncStatus, labels) : '-'}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-foreground">
                          {row.derivedOverallPlace ?? '-'}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {timestampFormatter.format(new Date(row.capturedAt))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Surface>
  );
}
