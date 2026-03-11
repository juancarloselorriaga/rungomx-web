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
        <h2 className="text-lg font-semibold leading-tight">{labels.sectionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.sectionDescription}</p>
      </div>

      {hideSummaryCards ? null : (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.primaryMetricTitle}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{headlineValue}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {labels.primaryMetricDescription}
            </p>
          </div>

          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.capturedFeesLabel}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{capturedValue}</p>
            <p className="mt-2 text-sm text-muted-foreground">{labels.currenciesDescription}</p>
          </div>

          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.adjustmentsLabel}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{adjustmentsValue}</p>
            <p className="mt-2 text-sm text-muted-foreground">{labels.adjustmentsDescription}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{labels.currenciesTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{labels.currenciesDescription}</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-4">{labels.currencyHeader}</th>
                  <th className="pb-2 pr-4 text-right">{labels.netHeader}</th>
                  <th className="pb-2 pr-4 text-right">{labels.capturedHeader}</th>
                  <th className="pb-2 pr-4 text-right">{labels.adjustmentHeader}</th>
                  <th className="pb-2 text-right">{labels.countHeader}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.currencies.map((row) => (
                  <tr key={row.currency} className="border-t">
                    <td className="py-2 pr-4 font-medium">{row.currency}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatMoneyFromMinor(row.netRecognizedFeeMinor, row.currency, locale)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatMoneyFromMinor(row.capturedFeeMinor, row.currency, locale)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatMoneyFromMinor(row.adjustmentsMinor, row.currency, locale)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.captureEventCount + row.adjustmentEventCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{labels.adjustmentsTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{labels.adjustmentsDescription}</p>
          {metrics.adjustments.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{labels.emptyAdjustments}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-4">{labels.currencyHeader}</th>
                    <th className="pb-2 pr-4">{labels.adjustmentCodeHeader}</th>
                    <th className="pb-2 pr-4 text-right">{labels.adjustmentHeader}</th>
                    <th className="pb-2 text-right">{labels.countHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.adjustments.map((row) => (
                    <tr key={`${row.currency}:${row.adjustmentCode}`} className="border-t">
                      <td className="py-2 pr-4 font-medium">{row.currency}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{row.adjustmentCode}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatMoneyFromMinor(row.amountMinor, row.currency, locale)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{row.eventCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{labels.traceabilityTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.traceabilityDescription}</p>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
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

        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.sampleTracesTitle}
          </h4>
          {metrics.traceability.sampleTraceIds.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{labels.sampleTracesEmpty}</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {metrics.traceability.sampleTraceIds.map((traceId) => (
                <code
                  key={traceId}
                  className="rounded bg-muted px-2 py-1 text-xs text-foreground"
                >
                  {traceId}
                </code>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
