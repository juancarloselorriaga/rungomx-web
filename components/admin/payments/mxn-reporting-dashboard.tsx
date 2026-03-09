import type { MxnNetRecognizedFeeReport } from '@/lib/payments/economics/mxn-reporting';

type MxnReportingDashboardLabels = {
  sectionTitle: string;
  sectionDescription: string;
  headlineTitle: string;
  convertedEventsTitle: string;
  missingSnapshotsTitle: string;
  tableTitle: string;
  tableDescription: string;
  currencyHeader: string;
  sourceHeader: string;
  mxnHeader: string;
  convertedEventsHeader: string;
  missingSnapshotsHeader: string;
  snapshotsHeader: string;
  missingTraceHeader: string;
  emptyState: string;
  notConvertedLabel: string;
};

type MxnReportingDashboardProps = {
  locale: 'es' | 'en';
  report: MxnNetRecognizedFeeReport;
  labels: MxnReportingDashboardLabels;
  hideSummaryCards?: boolean;
};

function formatMoney(valueMinor: number, currency: string, locale: 'es' | 'en'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueMinor / 100);
}

function formatSnapshotReference(
  effectiveAt: Date | string,
  rateToMxn: number,
  locale: 'es' | 'en',
): string {
  const normalized = effectiveAt instanceof Date ? effectiveAt : new Date(effectiveAt);
  if (Number.isNaN(normalized.getTime())) {
    return rateToMxn.toFixed(4);
  }
  const dateLabel = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  }).format(normalized);
  return `${dateLabel} · ${rateToMxn.toFixed(4)}`;
}

export function MxnReportingDashboard({
  locale,
  report,
  labels,
  hideSummaryCards = false,
}: MxnReportingDashboardProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{labels.sectionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.sectionDescription}</p>
      </div>

      {hideSummaryCards ? null : (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.headlineTitle}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {formatMoney(report.headlineMxnNetRecognizedFeeMinor, 'MXN', locale)}
            </p>
          </div>

          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.convertedEventsTitle}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{report.convertedEventCount}</p>
          </div>

          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.missingSnapshotsTitle}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {report.missingSnapshotEventCount}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{labels.tableTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.tableDescription}</p>

        {report.currencies.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{labels.emptyState}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[72rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-4">{labels.currencyHeader}</th>
                  <th className="pb-2 pr-4 text-right">{labels.sourceHeader}</th>
                  <th className="pb-2 pr-4 text-right">{labels.mxnHeader}</th>
                  <th className="pb-2 pr-4 text-right">{labels.convertedEventsHeader}</th>
                  <th className="pb-2 pr-4 text-right">{labels.missingSnapshotsHeader}</th>
                  <th className="pb-2 pr-4">{labels.snapshotsHeader}</th>
                  <th className="pb-2">{labels.missingTraceHeader}</th>
                </tr>
              </thead>
              <tbody>
                {report.currencies.map((row) => (
                  <tr key={row.sourceCurrency} className="border-t align-top">
                    <td className="py-3 pr-4 font-medium">{row.sourceCurrency}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {formatMoney(row.sourceNetRecognizedFeeMinor, row.sourceCurrency, locale)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {row.mxnNetRecognizedFeeMinor === null
                        ? labels.notConvertedLabel
                        : formatMoney(row.mxnNetRecognizedFeeMinor, 'MXN', locale)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">{row.convertedEventCount}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {row.missingSnapshotEventCount}
                    </td>
                    <td className="py-3 pr-4">
                      {row.appliedSnapshots.length === 0 ? (
                        <p className="text-xs text-muted-foreground">—</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.appliedSnapshots.map((snapshot) => (
                            <code
                              key={`${row.sourceCurrency}:${snapshot.snapshotId}`}
                              className="rounded bg-muted px-2 py-1 text-[11px]"
                            >
                              {snapshot.snapshotId} (
                              {formatSnapshotReference(
                                snapshot.effectiveAt,
                                snapshot.rateToMxn,
                                locale,
                              )}
                              )
                            </code>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3">
                      {row.sampleMissingSnapshotTraceIds.length === 0 ? (
                        <p className="text-xs text-muted-foreground">—</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.sampleMissingSnapshotTraceIds.map((traceId) => (
                            <code
                              key={`${row.sourceCurrency}:${traceId}`}
                              className="rounded bg-muted px-2 py-1 text-[11px]"
                            >
                              {traceId}
                            </code>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
