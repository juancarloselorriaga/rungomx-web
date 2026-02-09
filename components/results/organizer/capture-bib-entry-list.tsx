'use client';

import { SafeNextDetailsMessage } from '@/components/results/primitives/safe-next-details-message';
import { Button } from '@/components/ui/button';
import {
  createOfflineCaptureEntry,
  deriveOfflineCapturePreviewRows,
  getOfflinePendingSyncCount,
  loadOfflineCaptureStore,
  persistOfflineCaptureStore,
  type OfflineCaptureSyncConflict,
  type OfflineCaptureStatus,
} from '@/lib/events/results/offline/capture-store';
import { runDeterministicOfflineSync } from '@/lib/events/results/offline/sync-engine';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';

type CaptureBibEntryListLabels = {
  title: string;
  description: string;
  connectivityLabel: string;
  connectivityOnline: string;
  connectivityOffline: string;
  reassuranceSavedLocally: string;
  reassuranceNotPublic: string;
  reassurancePendingSync: string;
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
};

const STATUS_OPTIONS: OfflineCaptureStatus[] = ['finish', 'dnf', 'dns', 'dq'];

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

function abbreviateSession(sessionId: string): string {
  if (sessionId.length <= 12) return sessionId;
  return `${sessionId.slice(0, 6)}…${sessionId.slice(-4)}`;
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
}: CaptureBibEntryListProps) {
  const [store, setStore] = useState(() => loadOfflineCaptureStore(storageKey));
  const [bibNumber, setBibNumber] = useState('');
  const [finishTimeInput, setFinishTimeInput] = useState('');
  const [status, setStatus] = useState<OfflineCaptureStatus>('finish');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    persistOfflineCaptureStore(storageKey, store);
  }, [storageKey, store]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const pendingSyncCount = getOfflinePendingSyncCount(store.entries);
  const previewRows = useMemo(
    () => deriveOfflineCapturePreviewRows(store.entries),
    [store.entries],
  );
  const timestampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    [locale],
  );
  const unresolvedConflicts = useMemo(
    () => store.syncConflicts.filter((conflict) => conflict.finalizedAt === null),
    [store.syncConflicts],
  );

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

    setStore((current) => ({
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
        .filter(
          (conflict) => conflict.finalizedAt === null && conflict.resolution !== null,
        )
        .map((conflict) => ({
          conflictId: conflict.id,
          choice: conflict.resolution!.choice,
          actor: conflict.resolution!.resolvedBy,
          resolvedAt: conflict.resolution!.resolvedAt,
        })),
      maxBatchSize: 3,
    });

    setStore((current) => ({
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

  const onResolveConflict = (
    conflictId: string,
    choice: 'keep_local' | 'keep_server',
  ) => {
    setStore((current) => ({
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
      choice === 'keep_local'
        ? labels.conflictChoiceKeepLocal
        : labels.conflictChoiceKeepServer,
    );
  };

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground sm:text-base">{labels.title}</h3>
        <p className="text-xs text-muted-foreground sm:text-sm">{labels.description}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-md border bg-muted/30 p-3 dark:bg-muted/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.connectivityLabel}
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {isOnline ? labels.connectivityOnline : labels.connectivityOffline}
          </p>
        </article>
        <article className="rounded-md border bg-muted/30 p-3 dark:bg-muted/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.reassuranceSavedLocally}
          </p>
          <p className="mt-2 text-sm text-foreground">{labels.reassuranceNotPublic}</p>
        </article>
        <article className="rounded-md border bg-muted/30 p-3 dark:bg-muted/60 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.reassuranceNotPublic}
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {formatTemplateLabel(labels.reassurancePendingSync, pendingSyncCount)}
          </p>
        </article>
      </div>

      <section className="space-y-3 rounded-lg border bg-muted/30 p-3 dark:bg-muted/60">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {labels.bibLabel}
            </span>
            <input
              value={bibNumber}
              onChange={(event) => setBibNumber(event.target.value)}
              inputMode="numeric"
              placeholder={labels.bibPlaceholder}
              className="h-11 w-full rounded-md border bg-background px-3 text-base text-foreground"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {labels.timeLabel}
            </span>
            <input
              value={finishTimeInput}
              onChange={(event) => setFinishTimeInput(event.target.value)}
              inputMode="numeric"
              placeholder={labels.timePlaceholder}
              className="h-11 w-full rounded-md border bg-background px-3 text-base text-foreground"
            />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.statusLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => {
              const selected = status === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStatus(option)}
                  aria-pressed={selected}
                  className={cn(
                    'min-h-11 rounded-md border px-4 py-2 text-sm font-semibold transition-colors',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground',
                  )}
                >
                  {getStatusLabel(option, labels)}
                </button>
              );
            })}
          </div>
        </div>

        <Button type="button" onClick={onSubmit} className="h-11 w-full sm:w-auto">
          {labels.submitAction}
        </Button>

        {errorMessage ? (
          <p
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        {feedbackMessage ? (
          <p className="rounded-md border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
            {feedbackMessage}
          </p>
        ) : null}
      </section>

      <section className="space-y-2 rounded-lg border bg-muted/30 p-3 dark:bg-muted/60">
        <h4 className="text-sm font-semibold text-foreground">{labels.syncTitle}</h4>
        <p className="text-xs text-muted-foreground">{labels.syncDescription}</p>
        <Button
          type="button"
          variant="outline"
          onClick={onRunSync}
          className="h-11 w-full sm:w-auto"
        >
          {labels.syncAction}
        </Button>
      </section>

      <section className="space-y-3 rounded-lg border bg-muted/30 p-3 dark:bg-muted/60">
        <h4 className="text-sm font-semibold text-foreground">{labels.conflictTitle}</h4>
        <p className="text-xs text-muted-foreground">{labels.conflictDescription}</p>

        {unresolvedConflicts.length === 0 ? (
          <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {labels.conflictEmpty}
          </p>
        ) : (
          <div className="space-y-3">
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

            {unresolvedConflicts.map((conflict) => {
              const keepLocalSelected = conflict.resolution?.choice === 'keep_local';
              const keepServerSelected = conflict.resolution?.choice === 'keep_server';
              return (
                <article
                  key={conflict.id}
                  className="space-y-3 rounded-md border bg-card p-3"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 rounded-md border bg-muted/30 p-3 dark:bg-muted/50">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {labels.conflictLocalValues}
                      </p>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{labels.conflictFieldBib}</dt>
                          <dd className="font-medium text-foreground">{conflict.local.bibNumber}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{labels.conflictFieldStatus}</dt>
                          <dd className="font-medium text-foreground">
                            {getStatusLabel(conflict.local.status, labels)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{labels.conflictFieldFinishTime}</dt>
                          <dd className="font-medium text-foreground">
                            {formatTimeForPreview(conflict.local.finishTimeInput)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{labels.conflictFieldUpdatedAt}</dt>
                          <dd className="font-medium text-foreground">
                            {timestampFormatter.format(new Date(conflict.local.updatedAt))}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="space-y-1 rounded-md border bg-muted/30 p-3 dark:bg-muted/50">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {labels.conflictServerValues}
                      </p>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{labels.conflictFieldBib}</dt>
                          <dd className="font-medium text-foreground">{conflict.server.bibNumber}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{labels.conflictFieldStatus}</dt>
                          <dd className="font-medium text-foreground">
                            {getStatusLabel(conflict.server.status, labels)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{labels.conflictFieldFinishTime}</dt>
                          <dd className="font-medium text-foreground">
                            {formatTimeForPreview(conflict.server.finishTimeInput)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{labels.conflictFieldUpdatedAt}</dt>
                          <dd className="font-medium text-foreground">
                            {timestampFormatter.format(new Date(conflict.server.updatedAt))}
                          </dd>
                        </div>
                      </dl>
                    </div>
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
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-lg border bg-muted/30 p-3 dark:bg-muted/60">
        <h4 className="text-sm font-semibold text-foreground">{labels.entriesTitle}</h4>
        <p className="text-xs text-muted-foreground">{labels.entriesDescription}</p>

        {previewRows.length === 0 ? (
          <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {labels.entriesEmpty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-semibold">{labels.headers.bib}</th>
                  <th className="px-2 py-2 font-semibold">{labels.headers.status}</th>
                  <th className="px-2 py-2 font-semibold">{labels.headers.syncStatus}</th>
                  <th className="px-2 py-2 font-semibold">{labels.headers.finishTime}</th>
                  <th className="px-2 py-2 font-semibold">{labels.headers.derivedOverall}</th>
                  <th className="px-2 py-2 font-semibold">{labels.headers.capturedAt}</th>
                  <th className="px-2 py-2 font-semibold">{labels.headers.provenance}</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => {
                  const source = store.entries.find((entry) => entry.id === row.id);
                  return (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="px-2 py-2 text-foreground">{row.bibNumber}</td>
                      <td className="px-2 py-2 text-foreground">
                        {getStatusLabel(row.status, labels)}
                      </td>
                      <td className="px-2 py-2 text-foreground">
                        {source ? getSyncStatusLabel(source.syncStatus, labels) : '-'}
                      </td>
                      <td className="px-2 py-2 text-foreground">
                        {formatTimeForPreview(row.finishTimeInput)}
                      </td>
                      <td className="px-2 py-2 text-foreground">
                        {row.derivedOverallPlace ?? '-'}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {timestampFormatter.format(new Date(row.capturedAt))}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {source ? (
                          <span className="text-xs">
                            {labels.provenanceSession}: {abbreviateSession(source.provenance.sessionId)}
                            <br />
                            {labels.provenanceDevice}: {source.provenance.deviceLabel}
                            <br />
                            {labels.provenanceEditor}: {source.provenance.editorLabel}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
