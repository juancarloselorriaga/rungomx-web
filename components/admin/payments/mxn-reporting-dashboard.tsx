import { SampledReferenceList } from '@/components/admin/payments/sampled-reference-list';
import {
  PaymentsDataTable,
  PaymentsDataTableCell,
  PaymentsDataTableHead,
  PaymentsDataTableHeader,
  PaymentsDataTableRow,
  PaymentsResponsiveList,
  PaymentsResponsiveListGrid,
  PaymentsResponsiveListItem,
  PaymentsResponsiveListLabel,
  PaymentsResponsiveListValue,
} from '@/components/payments/payments-data-table';
import { PaymentsCountPill } from '@/components/payments/payments-typography';
import { PaymentsPanel } from '@/components/payments/payments-surfaces';
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
    <section className="space-y-4" data-testid="admin-payments-mxn-dashboard">
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

      <PaymentsPanel>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{labels.tableTitle}</h3>
          <PaymentsCountPill>{report.currencies.length}</PaymentsCountPill>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{labels.tableDescription}</p>

        {report.currencies.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{labels.emptyState}</p>
        ) : (
          <>
            <PaymentsResponsiveList className="mt-4">
              {report.currencies.map((row) => (
                <PaymentsResponsiveListItem key={row.sourceCurrency}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{row.sourceCurrency}</p>
                    <PaymentsCountPill>{row.convertedEventCount.toLocaleString(locale)}</PaymentsCountPill>
                  </div>
                  <PaymentsResponsiveListGrid className="mt-4">
                    <div>
                      <PaymentsResponsiveListLabel>{labels.sourceHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="font-medium tabular-nums">
                        {formatMoneyFromMinor(row.sourceNetRecognizedFeeMinor, row.sourceCurrency, locale)}
                      </PaymentsResponsiveListValue>
                    </div>
                    <div>
                      <PaymentsResponsiveListLabel>{labels.mxnHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="font-medium tabular-nums">
                        {row.mxnNetRecognizedFeeMinor === null
                          ? labels.notConvertedLabel
                          : formatMoneyFromMinor(row.mxnNetRecognizedFeeMinor, 'MXN', locale)}
                      </PaymentsResponsiveListValue>
                    </div>
                    <div>
                      <PaymentsResponsiveListLabel>{labels.convertedEventsHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="tabular-nums">
                        {row.convertedEventCount.toLocaleString(locale)}
                      </PaymentsResponsiveListValue>
                    </div>
                    <div>
                      <PaymentsResponsiveListLabel>{labels.missingSnapshotsHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="tabular-nums">
                        {row.missingSnapshotEventCount.toLocaleString(locale)}
                      </PaymentsResponsiveListValue>
                    </div>
                  </PaymentsResponsiveListGrid>
                  <div className="mt-4 space-y-3">
                    <div>
                      <PaymentsResponsiveListLabel>{labels.snapshotsHeader}</PaymentsResponsiveListLabel>
                      {row.appliedSnapshots.length === 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">—</p>
                      ) : (
                        <div className="mt-2">
                          <SampledReferenceList
                            items={row.appliedSnapshots.map(
                              (snapshot) =>
                                `${snapshot.snapshotId} (${formatSnapshotReference(
                                  snapshot.effectiveAt,
                                  snapshot.rateToMxn,
                                  locale,
                                )})`,
                            )}
                            countLabel={(count) => String(count)}
                            moreLabel={(count) => `+${count}`}
                            initialVisibleCount={2}
                            compact
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <PaymentsResponsiveListLabel>{labels.missingTraceHeader}</PaymentsResponsiveListLabel>
                      {row.sampleMissingSnapshotTraceIds.length === 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">—</p>
                      ) : (
                        <div className="mt-2">
                          <SampledReferenceList
                            items={row.sampleMissingSnapshotTraceIds}
                            countLabel={(count) => String(count)}
                            moreLabel={(count) => `+${count}`}
                            initialVisibleCount={2}
                            compact
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </PaymentsResponsiveListItem>
              ))}
            </PaymentsResponsiveList>
            <div className="hidden md:block">
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
                        <SampledReferenceList
                          items={row.appliedSnapshots.map(
                            (snapshot) =>
                              `${snapshot.snapshotId} (${formatSnapshotReference(
                                snapshot.effectiveAt,
                                snapshot.rateToMxn,
                                locale,
                              )})`,
                          )}
                          countLabel={(count) => String(count)}
                          moreLabel={(count) => `+${count}`}
                          initialVisibleCount={2}
                          compact
                        />
                      )}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell>
                      {row.sampleMissingSnapshotTraceIds.length === 0 ? (
                        <p className="text-xs text-muted-foreground">—</p>
                      ) : (
                        <SampledReferenceList
                          items={row.sampleMissingSnapshotTraceIds}
                          countLabel={(count) => String(count)}
                          moreLabel={(count) => `+${count}`}
                          initialVisibleCount={2}
                          compact
                        />
                      )}
                    </PaymentsDataTableCell>
                  </PaymentsDataTableRow>
                ))}
              </tbody>
              </PaymentsDataTable>
            </div>
          </>
        )}
      </PaymentsPanel>
    </section>
  );
}
