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
import { PaymentsInsetPanel, PaymentsMutedPanel, PaymentsPanel } from '@/components/payments/payments-surfaces';
import type { NetRecognizedFeeMetrics } from '@/lib/payments/economics/net-recognized-fees';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';

type NetRecognizedFeeDashboardLabels = {
  sectionTitle: string;
  sectionDescription: string;
  primaryMetricTitle: string;
  primaryMetricDescription: string;
  capturedFeesLabel: string;
  adjustmentsLabel: string;
  currenciesTitle: string;
  currenciesDescription: string;
  adjustmentsTitle: string;
  adjustmentsDescription: string;
  traceabilityTitle: string;
  traceabilityDescription: string;
  traceabilityWindowLabel: string;
  traceabilityEventsLabel: string;
  traceabilityTracesLabel: string;
  traceabilityFirstEventLabel: string;
  traceabilityLastEventLabel: string;
  sampleTracesTitle: string;
  sampleTracesEmpty: string;
  sampleTracesScopeLabel: (shown: number, total: number) => string;
  sampleTracesMoreLabel: (count: number) => string;
  currencyHeader: string;
  netHeader: string;
  capturedHeader: string;
  adjustmentHeader: string;
  countHeader: string;
  adjustmentCodeHeader: string;
  emptyAdjustments: string;
};

type NetRecognizedFeeDashboardProps = {
  locale: 'es' | 'en';
  metrics: NetRecognizedFeeMetrics;
  labels: NetRecognizedFeeDashboardLabels;
  rangeOptions?: Array<{ value: string; label: string }>;
  selectedRange?: string;
  hideSummaryCards?: boolean;
};

function formatDateTime(value: Date | string | null | undefined, locale: 'es' | 'en'): string {
  if (!value) return '—';
  const normalized = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(normalized.getTime())) return '—';

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(normalized);
}

export function NetRecognizedFeeDashboard({
  locale,
  metrics,
  labels,
  hideSummaryCards = false,
}: NetRecognizedFeeDashboardProps) {
  const headlineValue = formatMoneyFromMinor(
    metrics.headlineNetRecognizedFeeMinor,
    metrics.headlineCurrency,
    locale,
  );
  const capturedValue = formatMoneyFromMinor(
    metrics.headlineCapturedFeeMinor,
    metrics.headlineCurrency,
    locale,
  );
  const adjustmentsValue = formatMoneyFromMinor(
    metrics.headlineAdjustmentsMinor,
    metrics.headlineCurrency,
    locale,
  );

  return (
    <section className="space-y-4">
      <div>
        <PaymentsSectionTitle compact>{labels.sectionTitle}</PaymentsSectionTitle>
        <PaymentsSectionDescription className="mt-1">{labels.sectionDescription}</PaymentsSectionDescription>
      </div>

      {hideSummaryCards ? null : (
        <div className="grid gap-4 md:grid-cols-3">
          <PaymentsInsetPanel className="space-y-2">
            <PaymentsMetricLabel>{labels.primaryMetricTitle}</PaymentsMetricLabel>
            <PaymentsMetricValue className="text-3xl sm:text-[2rem]">{headlineValue}</PaymentsMetricValue>
            <p className="text-sm text-muted-foreground">
              {labels.primaryMetricDescription}
            </p>
          </PaymentsInsetPanel>

          <PaymentsInsetPanel className="space-y-2">
            <PaymentsMetricLabel>{labels.capturedFeesLabel}</PaymentsMetricLabel>
            <PaymentsMetricValue compact>{capturedValue}</PaymentsMetricValue>
            <p className="text-sm text-muted-foreground">{labels.currenciesDescription}</p>
          </PaymentsInsetPanel>

          <PaymentsInsetPanel className="space-y-2">
            <PaymentsMetricLabel>{labels.adjustmentsLabel}</PaymentsMetricLabel>
            <PaymentsMetricValue compact>{adjustmentsValue}</PaymentsMetricValue>
            <p className="text-sm text-muted-foreground">{labels.adjustmentsDescription}</p>
          </PaymentsInsetPanel>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <PaymentsPanel>
          <PaymentsSectionTitle compact className="text-base">{labels.currenciesTitle}</PaymentsSectionTitle>
          <p className="mt-1 text-xs text-muted-foreground">{labels.currenciesDescription}</p>
          <PaymentsDataTable minWidthClassName="min-w-[28rem]">
              <PaymentsDataTableHead>
                <tr>
                  <PaymentsDataTableHeader>{labels.currencyHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader align="right">{labels.netHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader align="right">{labels.capturedHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader align="right">{labels.adjustmentHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader align="right">{labels.countHeader}</PaymentsDataTableHeader>
                </tr>
              </PaymentsDataTableHead>
              <tbody>
                {metrics.currencies.map((row) => (
                  <PaymentsDataTableRow key={row.currency}>
                    <PaymentsDataTableCell className="font-medium">{row.currency}</PaymentsDataTableCell>
                    <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                      {formatMoneyFromMinor(row.netRecognizedFeeMinor, row.currency, locale)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                      {formatMoneyFromMinor(row.capturedFeeMinor, row.currency, locale)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                      {formatMoneyFromMinor(row.adjustmentsMinor, row.currency, locale)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                      {row.captureEventCount + row.adjustmentEventCount}
                    </PaymentsDataTableCell>
                  </PaymentsDataTableRow>
                ))}
              </tbody>
            </PaymentsDataTable>
        </PaymentsPanel>

        <PaymentsPanel>
          <PaymentsSectionTitle compact className="text-base">{labels.adjustmentsTitle}</PaymentsSectionTitle>
          <p className="mt-1 text-xs text-muted-foreground">{labels.adjustmentsDescription}</p>
          {metrics.adjustments.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{labels.emptyAdjustments}</p>
          ) : (
            <PaymentsDataTable minWidthClassName="min-w-[28rem]">
                <PaymentsDataTableHead>
                  <tr>
                    <PaymentsDataTableHeader>{labels.currencyHeader}</PaymentsDataTableHeader>
                    <PaymentsDataTableHeader>{labels.adjustmentCodeHeader}</PaymentsDataTableHeader>
                    <PaymentsDataTableHeader align="right">{labels.adjustmentHeader}</PaymentsDataTableHeader>
                    <PaymentsDataTableHeader align="right">{labels.countHeader}</PaymentsDataTableHeader>
                  </tr>
                </PaymentsDataTableHead>
                <tbody>
                  {metrics.adjustments.map((row) => (
                    <PaymentsDataTableRow key={`${row.currency}:${row.adjustmentCode}`}>
                      <PaymentsDataTableCell className="font-medium">{row.currency}</PaymentsDataTableCell>
                      <PaymentsDataTableCell className="font-mono text-xs whitespace-nowrap">
                        {row.adjustmentCode}
                      </PaymentsDataTableCell>
                      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                        {formatMoneyFromMinor(row.amountMinor, row.currency, locale)}
                      </PaymentsDataTableCell>
                      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                        {row.eventCount}
                      </PaymentsDataTableCell>
                    </PaymentsDataTableRow>
                  ))}
                </tbody>
              </PaymentsDataTable>
          )}
        </PaymentsPanel>
      </div>

      <PaymentsPanel>
        <PaymentsSectionTitle compact className="text-base">{labels.traceabilityTitle}</PaymentsSectionTitle>
        <p className="mt-1 text-xs text-muted-foreground">{labels.traceabilityDescription}</p>
        <PaymentsMutedPanel className="mt-4">
        <dl className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {labels.traceabilityWindowLabel}
            </dt>
            <dd className="mt-1">
              {formatDateTime(metrics.traceability.windowStart, locale)} -{' '}
              {formatDateTime(metrics.traceability.windowEnd, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {labels.traceabilityEventsLabel}
            </dt>
            <dd className="mt-1 tabular-nums">{metrics.traceability.eventCount}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {labels.traceabilityTracesLabel}
            </dt>
            <dd className="mt-1 tabular-nums">{metrics.traceability.distinctTraceCount}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {labels.traceabilityFirstEventLabel}
            </dt>
            <dd className="mt-1">{formatDateTime(metrics.traceability.firstOccurredAt, locale)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {labels.traceabilityLastEventLabel}
            </dt>
            <dd className="mt-1">{formatDateTime(metrics.traceability.lastOccurredAt, locale)}</dd>
          </div>
        </dl>
        </PaymentsMutedPanel>

        <PaymentsInsetPanel className="mt-4">
          <SampledReferenceList
            title={labels.sampleTracesTitle}
            items={metrics.traceability.sampleTraceIds}
            emptyLabel={labels.sampleTracesEmpty}
            totalCount={metrics.traceability.distinctTraceCount}
            scopeLabel={labels.sampleTracesScopeLabel}
            moreLabel={labels.sampleTracesMoreLabel}
          />
        </PaymentsInsetPanel>
      </PaymentsPanel>
    </section>
  );
}
