'use client';

import { Badge } from '@/components/common/badge';
import { cn } from '@/lib/utils';
import type {
  OrganizerResultsRow,
  ResultsSyncStatus,
  ResultsValidationState,
} from '@/lib/events/results/workspace';
import {
  ResultsDensitySwitch,
  useResultsDensityPreference,
} from '@/components/results/primitives/results-density-switch';

type TableProResultsGridProps = {
  rows: Array<
    Pick<
      OrganizerResultsRow,
      | 'id'
      | 'bibNumber'
      | 'runnerName'
      | 'validationState'
      | 'resultStatus'
      | 'syncStatus'
      | 'finishTimeMillis'
      | 'details'
    > & {
      updatedAtLabel: string;
    }
  >;
  densityStorageKey: string;
  labels: {
    title: string;
    description: string;
    empty: string;
    headers: {
      bib: string;
      runner: string;
      validation?: string;
      resultStatus: string;
      syncStatus: string;
      finishTime: string;
      updated: string;
      details: string;
    };
    density: {
      label: string;
      compact: string;
      full: string;
    };
    resultStatus: {
      finish: string;
      dnf: string;
      dns: string;
      dq: string;
    };
    syncStatus: {
      synced: string;
      pendingSync: string;
      conflict: string;
    };
    validationState?: {
      clear: string;
      warning: string;
      blocker: string;
    };
  };
};

const syncStatusTone: Record<ResultsSyncStatus, 'green' | 'indigo' | 'outline'> = {
  synced: 'green',
  pending_sync: 'indigo',
  conflict: 'outline',
};

const validationTone: Record<ResultsValidationState, 'green' | 'indigo' | 'outline'> = {
  clear: 'green',
  warning: 'indigo',
  blocker: 'outline',
};

function formatFinishTime(milliseconds: number | null): string {
  if (milliseconds === null || milliseconds < 0) {
    return '-';
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getResultStatusLabel(
  resultStatus: OrganizerResultsRow['resultStatus'],
  labels: TableProResultsGridProps['labels']['resultStatus'],
): string {
  switch (resultStatus) {
    case 'dnf':
      return labels.dnf;
    case 'dns':
      return labels.dns;
    case 'dq':
      return labels.dq;
    default:
      return labels.finish;
  }
}

function getSyncStatusLabel(
  syncStatus: OrganizerResultsRow['syncStatus'],
  labels: TableProResultsGridProps['labels']['syncStatus'],
): string {
  switch (syncStatus) {
    case 'pending_sync':
      return labels.pendingSync;
    case 'conflict':
      return labels.conflict;
    default:
      return labels.synced;
  }
}

function getValidationStateLabel(
  validationState: ResultsValidationState,
  labels: NonNullable<TableProResultsGridProps['labels']['validationState']>,
): string {
  switch (validationState) {
    case 'warning':
      return labels.warning;
    case 'blocker':
      return labels.blocker;
    default:
      return labels.clear;
  }
}

export function TableProResultsGrid({
  rows,
  densityStorageKey,
  labels,
}: TableProResultsGridProps) {
  const [density] = useResultsDensityPreference(densityStorageKey, 'full');
  const isCompact = density === 'compact';
  const showValidationColumn =
    rows.some((row) => row.validationState !== undefined) &&
    Boolean(labels.headers.validation && labels.validationState);

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground sm:text-base">{labels.title}</h3>
          <p className="text-xs text-muted-foreground sm:text-sm">{labels.description}</p>
        </div>
        <ResultsDensitySwitch storageKey={densityStorageKey} labels={labels.density} />
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-8 text-sm text-muted-foreground">{labels.empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">{labels.headers.bib}</th>
                <th className="px-4 py-2.5 font-semibold">{labels.headers.runner}</th>
                {showValidationColumn ? (
                  <th className="px-4 py-2.5 font-semibold">{labels.headers.validation}</th>
                ) : null}
                <th className="px-4 py-2.5 font-semibold">{labels.headers.resultStatus}</th>
                <th className="px-4 py-2.5 font-semibold">{labels.headers.syncStatus}</th>
                <th className="px-4 py-2.5 font-semibold">{labels.headers.finishTime}</th>
                <th className="px-4 py-2.5 font-semibold">{labels.headers.updated}</th>
                {!isCompact ? (
                  <th className="px-4 py-2.5 font-semibold">{labels.headers.details}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const resultStatusLabel = getResultStatusLabel(
                  row.resultStatus,
                  labels.resultStatus,
                );
                const syncStatusLabel = getSyncStatusLabel(row.syncStatus, labels.syncStatus);
                const validationStateLabel =
                  row.validationState && labels.validationState
                    ? getValidationStateLabel(row.validationState, labels.validationState)
                    : null;

                return (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td
                      className={cn(
                        'px-4 text-foreground',
                        isCompact ? 'py-2.5 text-xs' : 'py-3.5',
                      )}
                    >
                      {row.bibNumber ?? '-'}
                    </td>
                    <td className={cn('px-4 text-foreground', isCompact ? 'py-2.5' : 'py-3.5')}>
                      <span className={cn(isCompact ? 'text-xs font-medium' : 'font-medium')}>
                        {row.runnerName}
                      </span>
                    </td>
                    {showValidationColumn ? (
                      <td className={cn('px-4', isCompact ? 'py-2.5' : 'py-3.5')}>
                        {row.validationState && validationStateLabel ? (
                          <Badge size="sm" variant={validationTone[row.validationState]}>
                            {validationStateLabel}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    ) : null}
                    <td className={cn('px-4', isCompact ? 'py-2.5' : 'py-3.5')}>
                      <Badge size="sm" variant="outline">
                        {resultStatusLabel}
                      </Badge>
                    </td>
                    <td className={cn('px-4', isCompact ? 'py-2.5' : 'py-3.5')}>
                      <Badge size="sm" variant={syncStatusTone[row.syncStatus]}>
                        {syncStatusLabel}
                      </Badge>
                    </td>
                    <td className={cn('px-4 text-foreground', isCompact ? 'py-2.5 text-xs' : 'py-3.5')}>
                      {formatFinishTime(row.finishTimeMillis)}
                    </td>
                    <td
                      className={cn(
                        'px-4 text-muted-foreground',
                        isCompact ? 'py-2.5 text-xs' : 'py-3.5',
                      )}
                    >
                      {row.updatedAtLabel}
                    </td>
                    {!isCompact ? (
                      <td className="px-4 py-3.5 text-muted-foreground">{row.details}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
