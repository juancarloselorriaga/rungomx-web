import {
  PaymentsDataTable,
  PaymentsDataTableCell,
  PaymentsDataTableHead,
  PaymentsDataTableHeader,
  PaymentsDataTableRow,
} from '@/components/payments/payments-data-table';
import type { MxnNetRecognizedFeeReport } from '@/lib/payments/economics/mxn-reporting';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';

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
              {formatMoneyFromMinor(report.headlineMxnNetRecognizedFeeMinor, 'MXN', locale)}
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
          <PaymentsDataTable minWidthClassName="min-w-[72rem]">
              <PaymentsDataTableHead>
                <tr>
                  <PaymentsDataTableHeader>{labels.currencyHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader align="right">{labels.sourceHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader align="right">{labels.mxnHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader align="right">{labels.convertedEventsHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader align="right">{labels.missingSnapshotsHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.snapshotsHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.missingTraceHeader}</PaymentsDataTableHeader>
                </tr>
              </PaymentsDataTableHead>
              <tbody>
                {report.currencies.map((row) => (
                  <PaymentsDataTableRow key={row.sourceCurrency}>
                    <PaymentsDataTableCell className="font-medium">{row.sourceCurrency}</PaymentsDataTableCell>
                    <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                      {formatMoneyFromMinor(
                        row.sourceNetRecognizedFeeMinor,
                        row.sourceCurrency,
                        locale,
                      )}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                      {row.mxnNetRecognizedFeeMinor === null
                        ? labels.notConvertedLabel
                        : formatMoneyFromMinor(row.mxnNetRecognizedFeeMinor, 'MXN', locale)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                      {row.convertedEventCount}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                      {row.missingSnapshotEventCount}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell>
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
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell>
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
                    </PaymentsDataTableCell>
                  </PaymentsDataTableRow>
                ))}
              </tbody>
            </PaymentsDataTable>
        )}
      </div>
    </section>
  );
}
