import type {
  DebtDisputeEventExposureRow,
  DebtDisputeExposureMetrics,
  DebtDisputeOrganizerExposureRow,
} from '@/lib/payments/economics/debt-dispute-exposure';

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
  currenciesLabel: string;
  emptyState: string;
};

type DebtDisputeExposureDashboardProps = {
  locale: 'es' | 'en';
  metrics: DebtDisputeExposureMetrics;
  labels: DebtDisputeExposureDashboardLabels;
};

function formatMoney(valueMinor: number, currency: string, locale: 'es' | 'en'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueMinor / 100);
}

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
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {params.labels.sampleTracesLabel}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {params.sampleTraceIds.map((traceId) => (
              <code key={traceId} className="rounded bg-muted px-2 py-1 text-[11px]">
                {traceId}
              </code>
            ))}
          </div>
        </div>
      ) : null}
      {hasCases ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {params.labels.sampleCasesLabel}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {params.sampleCaseIds.map((caseId) => (
              <code key={caseId} className="rounded bg-muted px-2 py-1 text-[11px]">
                {caseId}
              </code>
            ))}
          </div>
        </div>
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
    <tr key={label} className="border-t align-top">
      <td className="py-3 pr-4">
        <p className="font-medium">{label}</p>
        {secondaryCurrencyCount > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {labels.currenciesLabel.replace('{count}', String(secondaryCurrencyCount))}
          </p>
        ) : null}
        {renderRowDetailChips({
          sampleTraceIds: row.traceability.sampleTraceIds,
          sampleCaseIds: row.traceability.sampleDisputeCaseIds,
          labels,
        })}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums">
        {formatMoney(row.headlineExposureScoreMinor, row.headlineCurrency, locale)}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums">
        {formatMoney(row.headlineOpenDisputeAtRiskMinor, row.headlineCurrency, locale)}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums">
        {formatMoney(row.headlineDebtPostedMinor, row.headlineCurrency, locale)}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums">{row.openDisputeCaseCount}</td>
      <td className="py-3 pr-4 text-right tabular-nums">{row.pauseRequiredCount}</td>
      <td className="py-3 pr-4 text-right tabular-nums">{row.resumeAllowedCount}</td>
      <td className="py-3 pr-4 text-right tabular-nums">{row.traceability.distinctTraceCount}</td>
      <td className="py-3 text-right tabular-nums">{row.traceability.distinctDisputeCaseCount}</td>
    </tr>
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
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[70rem] text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="pb-2 pr-4">{params.labels.groupHeader}</th>
            <th className="pb-2 pr-4 text-right">{params.labels.exposureHeader}</th>
            <th className="pb-2 pr-4 text-right">{params.labels.openAtRiskHeader}</th>
            <th className="pb-2 pr-4 text-right">{params.labels.debtPostedHeader}</th>
            <th className="pb-2 pr-4 text-right">{params.labels.openCasesHeader}</th>
            <th className="pb-2 pr-4 text-right">{params.labels.pauseHeader}</th>
            <th className="pb-2 pr-4 text-right">{params.labels.resumeHeader}</th>
            <th className="pb-2 pr-4 text-right">{params.labels.tracesHeader}</th>
            <th className="pb-2 text-right">{params.labels.disputeCasesHeader}</th>
          </tr>
        </thead>
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
      </table>
    </div>
  );
}

export function DebtDisputeExposureDashboard({
  locale,
  metrics,
  labels,
}: DebtDisputeExposureDashboardProps) {
  const summaryExposure = formatMoney(
    metrics.totals.headlineExposureScoreMinor,
    metrics.totals.headlineCurrency,
    locale,
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{labels.sectionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.sectionDescription}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {labels.summaryExposureTitle}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{summaryExposure}</p>
        </div>

        <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {labels.summaryOpenCasesTitle}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {metrics.totals.openDisputeCaseCount}
          </p>
        </div>

        <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {labels.summaryPolicyPausesTitle}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {metrics.totals.pauseRequiredCount}
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{labels.organizerTableTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.organizerTableDescription}</p>
        {renderTable({
          rows: metrics.organizers,
          labels,
          locale,
        })}
      </div>

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{labels.eventTableTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.eventTableDescription}</p>
        {renderTable({
          rows: metrics.events,
          labels,
          locale,
        })}
      </div>
    </section>
  );
}
