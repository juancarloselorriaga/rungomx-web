import { SampledReferenceList } from '@/components/admin/payments/sampled-reference-list';
import {
  PaymentsDataTable,
  PaymentsDataTableCell,
  PaymentsDataTableHead,
  PaymentsDataTableHeader,
  PaymentsDataTableRow,
} from '@/components/payments/payments-data-table';
import {
  PaymentsMetricLabel,
  PaymentsMetricValue,
  PaymentsSectionDescription,
  PaymentsSectionTitle,
} from '@/components/payments/payments-typography';
import { PaymentsInsetPanel, PaymentsPanel } from '@/components/payments/payments-surfaces';
import type {
  DebtDisputeEventExposureRow,
  DebtDisputeExposureMetrics,
  DebtDisputeOrganizerExposureRow,
} from '@/lib/payments/economics/debt-dispute-exposure';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';

type DebtDisputeExposureDashboardLabels = {
  sectionTitle: string;
  sectionDescription: string;
  summaryExposureTitle: string;
  summaryOpenCasesTitle: string;
  summaryPolicyPausesTitle: string;
  organizerTableTitle: string;
  organizerTableDescription: string;
  eventTableTitle: string;
  eventTableDescription: string;
  groupHeader: string;
  exposureHeader: string;
  openAtRiskHeader: string;
  debtPostedHeader: string;
  openCasesHeader: string;
  pauseHeader: string;
  resumeHeader: string;
  tracesHeader: string;
  disputeCasesHeader: string;
  sampleTracesLabel: string;
  sampleCasesLabel: string;
  sampledTraceCountLabel: (count: number) => string;
  sampledCaseCountLabel: (count: number) => string;
  sampledMoreLabel: (count: number) => string;
  currenciesLabel: (count: number) => string;
  emptyState: string;
};

type DebtDisputeExposureDashboardProps = {
  locale: 'es' | 'en';
  metrics: DebtDisputeExposureMetrics;
  labels: DebtDisputeExposureDashboardLabels;
  hideSummaryCards?: boolean;
};

function renderRowDetailChips(params: {
  sampleTraceIds: string[];
  sampleCaseIds: string[];
  labels: DebtDisputeExposureDashboardLabels;
}) {
  const hasTraces = params.sampleTraceIds.length > 0;
  const hasCases = params.sampleCaseIds.length > 0;

  if (!hasTraces && !hasCases) {
    return <p className="mt-2 text-xs text-muted-foreground">—</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      {hasTraces ? (
        <SampledReferenceList
          compact
          title={params.labels.sampleTracesLabel}
          items={params.sampleTraceIds}
          countLabel={params.labels.sampledTraceCountLabel}
          moreLabel={params.labels.sampledMoreLabel}
        />
      ) : null}
      {hasCases ? (
        <SampledReferenceList
          compact
          title={params.labels.sampleCasesLabel}
          items={params.sampleCaseIds}
          countLabel={params.labels.sampledCaseCountLabel}
          moreLabel={params.labels.sampledMoreLabel}
        />
      ) : null}
    </div>
  );
}

function renderTableRow(params: {
  row: DebtDisputeOrganizerExposureRow | DebtDisputeEventExposureRow;
  label: string;
  locale: 'es' | 'en';
  labels: DebtDisputeExposureDashboardLabels;
}) {
  const { row, label, locale, labels } = params;
  const secondaryCurrencyCount = Math.max(row.currencies.length - 1, 0);

  return (
    <PaymentsDataTableRow key={label}>
      <PaymentsDataTableCell>
        <p className="font-medium">{label}</p>
        {secondaryCurrencyCount > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {labels.currenciesLabel(secondaryCurrencyCount)}
          </p>
        ) : null}
        {renderRowDetailChips({
          sampleTraceIds: row.traceability.sampleTraceIds,
          sampleCaseIds: row.traceability.sampleDisputeCaseIds,
          labels,
        })}
      </PaymentsDataTableCell>
      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
        {formatMoneyFromMinor(row.headlineExposureScoreMinor, row.headlineCurrency, locale)}
      </PaymentsDataTableCell>
      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
        {formatMoneyFromMinor(
          row.headlineOpenDisputeAtRiskMinor,
          row.headlineCurrency,
          locale,
        )}
      </PaymentsDataTableCell>
      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
        {formatMoneyFromMinor(row.headlineDebtPostedMinor, row.headlineCurrency, locale)}
      </PaymentsDataTableCell>
      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
        {row.openDisputeCaseCount}
      </PaymentsDataTableCell>
      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
        {row.pauseRequiredCount}
      </PaymentsDataTableCell>
      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
        {row.resumeAllowedCount}
      </PaymentsDataTableCell>
      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
        {row.traceability.distinctTraceCount}
      </PaymentsDataTableCell>
      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
        {row.traceability.distinctDisputeCaseCount}
      </PaymentsDataTableCell>
    </PaymentsDataTableRow>
  );
}

function renderTable(params: {
  rows: Array<DebtDisputeOrganizerExposureRow | DebtDisputeEventExposureRow>;
  labels: DebtDisputeExposureDashboardLabels;
  locale: 'es' | 'en';
}) {
  if (params.rows.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">{params.labels.emptyState}</p>;
  }

  return (
    <PaymentsDataTable minWidthClassName="min-w-[70rem]">
        <PaymentsDataTableHead>
          <tr>
            <PaymentsDataTableHeader>{params.labels.groupHeader}</PaymentsDataTableHeader>
            <PaymentsDataTableHeader align="right">{params.labels.exposureHeader}</PaymentsDataTableHeader>
            <PaymentsDataTableHeader align="right">{params.labels.openAtRiskHeader}</PaymentsDataTableHeader>
            <PaymentsDataTableHeader align="right">{params.labels.debtPostedHeader}</PaymentsDataTableHeader>
            <PaymentsDataTableHeader align="right">{params.labels.openCasesHeader}</PaymentsDataTableHeader>
            <PaymentsDataTableHeader align="right">{params.labels.pauseHeader}</PaymentsDataTableHeader>
            <PaymentsDataTableHeader align="right">{params.labels.resumeHeader}</PaymentsDataTableHeader>
            <PaymentsDataTableHeader align="right">{params.labels.tracesHeader}</PaymentsDataTableHeader>
            <PaymentsDataTableHeader align="right">{params.labels.disputeCasesHeader}</PaymentsDataTableHeader>
          </tr>
        </PaymentsDataTableHead>
        <tbody>
          {params.rows.map((row) =>
            renderTableRow({
              row,
              label: 'organizerLabel' in row ? row.organizerLabel : row.eventLabel,
              locale: params.locale,
              labels: params.labels,
            }),
          )}
        </tbody>
      </PaymentsDataTable>
  );
}

export function DebtDisputeExposureDashboard({
  locale,
  metrics,
  labels,
  hideSummaryCards = false,
}: DebtDisputeExposureDashboardProps) {
  const summaryExposure = formatMoneyFromMinor(
    metrics.totals.headlineExposureScoreMinor,
    metrics.totals.headlineCurrency,
    locale,
  );

  return (
    <section className="space-y-4" data-testid="admin-payments-risk-dashboard">
      <div>
        <PaymentsSectionTitle compact>{labels.sectionTitle}</PaymentsSectionTitle>
        <PaymentsSectionDescription className="mt-1">{labels.sectionDescription}</PaymentsSectionDescription>
      </div>

      {hideSummaryCards ? null : (
        <div className="grid gap-4 md:grid-cols-3">
          <PaymentsInsetPanel className="space-y-2">
            <PaymentsMetricLabel>{labels.summaryExposureTitle}</PaymentsMetricLabel>
            <PaymentsMetricValue compact>{summaryExposure}</PaymentsMetricValue>
          </PaymentsInsetPanel>

          <PaymentsInsetPanel className="space-y-2">
            <PaymentsMetricLabel>{labels.summaryOpenCasesTitle}</PaymentsMetricLabel>
            <PaymentsMetricValue compact>
              {metrics.totals.openDisputeCaseCount}
            </PaymentsMetricValue>
          </PaymentsInsetPanel>

          <PaymentsInsetPanel className="space-y-2">
            <PaymentsMetricLabel>{labels.summaryPolicyPausesTitle}</PaymentsMetricLabel>
            <PaymentsMetricValue compact>
              {metrics.totals.pauseRequiredCount}
            </PaymentsMetricValue>
          </PaymentsInsetPanel>
        </div>
      )}

      <PaymentsPanel>
        <PaymentsSectionTitle compact className="text-base">{labels.organizerTableTitle}</PaymentsSectionTitle>
        <p className="mt-1 text-xs text-muted-foreground">{labels.organizerTableDescription}</p>
        {renderTable({
          rows: metrics.organizers,
          labels,
          locale,
        })}
      </PaymentsPanel>

      <PaymentsPanel>
        <PaymentsSectionTitle compact className="text-base">{labels.eventTableTitle}</PaymentsSectionTitle>
        <p className="mt-1 text-xs text-muted-foreground">{labels.eventTableDescription}</p>
        {renderTable({
          rows: metrics.events,
          labels,
          locale,
        })}
      </PaymentsPanel>
    </section>
  );
}
