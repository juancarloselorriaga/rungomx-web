import { Button } from '@/components/ui/button';
import type { PaymentCaptureVolumeMetrics } from '@/lib/payments/volume/payment-capture-volume';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';

type PaymentCaptureVolumeDashboardLabels = {
  sectionTitle: string;
  sectionDescription: string;
  mixedCurrencyNotice: string;
  grossProcessedLabel: string;
  grossProcessedDescription: string;
  platformFeesLabel: string;
  platformFeesDescription: string;
  organizerProceedsLabel: string;
  organizerProceedsDescription: string;
  capturedPaymentsLabel: string;
  capturedPaymentsDescription: string;
  currenciesTitle: string;
  currenciesDescription: string;
  currencyHeader: string;
  grossHeader: string;
  feesHeader: string;
  proceedsHeader: string;
  countHeader: string;
  emptyCurrencies: string;
  traceabilityTitle: string;
  traceabilityDescription: string;
  traceabilityWindowLabel: string;
  traceabilityEventsLabel: string;
  traceabilityTracesLabel: string;
  traceabilityExcludedLabel: string;
  traceabilityFirstEventLabel: string;
  traceabilityLastEventLabel: string;
  sampleTracesTitle: string;
  sampleTracesEmpty: string;
  topOrganizersTitle: string;
  topOrganizersDescription: string;
  organizerHeader: string;
  organizerGrossHeader: string;
  organizerFeesHeader: string;
  organizerProceedsHeader: string;
  organizerCountHeader: string;
  organizerActionHeader: string;
  organizerEmpty: string;
  organizerPageSummary: string;
  previousPageLabel: string;
  nextPageLabel: string;
  investigationTitle: string;
  investigationDescription: string;
  investigationActionLabel: string;
  organizerActionLabel: string;
};

type PaymentCaptureVolumeDashboardProps = {
  locale: 'es' | 'en';
  metrics: PaymentCaptureVolumeMetrics;
  labels: PaymentCaptureVolumeDashboardLabels;
  queryState: Record<string, string>;
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

export function PaymentCaptureVolumeDashboard({
  locale,
  metrics,
  labels,
  queryState,
}: PaymentCaptureVolumeDashboardProps) {
  const headlineCurrency = metrics.headlineCurrency;
  const summaryCards = [
    {
      label: labels.grossProcessedLabel,
      value: formatMoneyFromMinor(metrics.headlineGrossProcessedMinor, headlineCurrency, locale),
      description: labels.grossProcessedDescription,
    },
    {
      label: labels.platformFeesLabel,
      value: formatMoneyFromMinor(metrics.headlinePlatformFeeMinor, headlineCurrency, locale),
      description: labels.platformFeesDescription,
    },
    {
      label: labels.organizerProceedsLabel,
      value: formatMoneyFromMinor(
        metrics.headlineOrganizerProceedsMinor,
        headlineCurrency,
        locale,
      ),
      description: labels.organizerProceedsDescription,
    },
    {
      label: labels.capturedPaymentsLabel,
      value: metrics.headlineCaptureCount.toLocaleString(locale),
      description: labels.capturedPaymentsDescription,
    },
  ];
  const showMixedCurrencyNotice = metrics.currencies.length > 1;
  const organizerStart =
    metrics.organizerPagination.total === 0
      ? 0
      : (metrics.organizerPagination.page - 1) * metrics.organizerPagination.pageSize + 1;
  const organizerEnd =
    metrics.organizerPagination.total === 0
      ? 0
      : Math.min(
          metrics.organizerPagination.total,
          metrics.organizerPagination.page * metrics.organizerPagination.pageSize,
        );

  function buildQueryHref(overrides: Record<string, string | null | undefined>): string {
    const next = new URLSearchParams(queryState);
    for (const [key, value] of Object.entries(overrides)) {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    const query = next.toString();
    return query.length > 0 ? `?${query}` : '?';
  }

  const previousOrganizerHref =
    metrics.organizerPagination.page > 1
      ? buildQueryHref({
          workspace: 'volume',
          organizerPage: String(metrics.organizerPagination.page - 1),
        })
      : null;
  const nextOrganizerHref =
    metrics.organizerPagination.page < metrics.organizerPagination.pageCount
      ? buildQueryHref({
          workspace: 'volume',
          organizerPage: String(metrics.organizerPagination.page + 1),
        })
      : null;
  const investigationWorkspaceHref = buildQueryHref({
    workspace: 'investigation',
    investigationTool: 'lookup',
    organizerPage: null,
    evidenceTraceId: null,
  });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{labels.sectionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.sectionDescription}</p>
        {showMixedCurrencyNotice ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {labels.mixedCurrencyNotice.replace('{currency}', headlineCurrency)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{card.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{card.description}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{labels.currenciesTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{labels.currenciesDescription}</p>
          {metrics.currencies.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{labels.emptyCurrencies}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-4">{labels.currencyHeader}</th>
                    <th className="pb-2 pr-4 text-right">{labels.grossHeader}</th>
                    <th className="pb-2 pr-4 text-right">{labels.feesHeader}</th>
                    <th className="pb-2 pr-4 text-right">{labels.proceedsHeader}</th>
                    <th className="pb-2 text-right">{labels.countHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.currencies.map((row) => (
                    <tr key={row.sourceCurrency} className="border-t">
                      <td className="py-2 pr-4 font-medium">{row.sourceCurrency}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatMoneyFromMinor(row.grossProcessedMinor, row.sourceCurrency, locale)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatMoneyFromMinor(row.platformFeeMinor, row.sourceCurrency, locale)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatMoneyFromMinor(
                          row.organizerProceedsMinor,
                          row.sourceCurrency,
                          locale,
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.captureCount.toLocaleString(locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{labels.traceabilityTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{labels.traceabilityDescription}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
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
                {labels.traceabilityExcludedLabel}
              </dt>
              <dd className="mt-1 tabular-nums">{metrics.traceability.excludedEventCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {labels.traceabilityFirstEventLabel}
              </dt>
              <dd className="mt-1">{formatDateTime(metrics.traceability.firstOccurredAt, locale)}</dd>
            </div>
            <div className="sm:col-span-2">
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
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">{labels.topOrganizersTitle}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {labels.topOrganizersDescription}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {labels.organizerPageSummary
                .replace('{start}', organizerStart.toLocaleString(locale))
                .replace('{end}', organizerEnd.toLocaleString(locale))
                .replace('{total}', metrics.organizerPagination.total.toLocaleString(locale))}
            </p>
          </div>

          {metrics.organizers.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{labels.organizerEmpty}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-4">{labels.organizerHeader}</th>
                    <th className="pb-2 pr-4 text-right">{labels.organizerGrossHeader}</th>
                    <th className="pb-2 pr-4 text-right">{labels.organizerFeesHeader}</th>
                    <th className="pb-2 pr-4 text-right">{labels.organizerProceedsHeader}</th>
                    <th className="pb-2 pr-4 text-right">{labels.organizerCountHeader}</th>
                    <th className="pb-2 text-right">{labels.organizerActionHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.organizers.map((row) => {
                    const traceId = row.traceability.sampleTraceIds[0] ?? null;
                    const investigationHref = buildQueryHref({
                      workspace: 'investigation',
                      investigationTool: traceId ? 'trace' : 'lookup',
                      evidenceTraceId: traceId,
                      organizerPage: null,
                    });

                    return (
                      <tr key={row.organizerId ?? row.organizerLabel} className="border-t">
                        <td className="py-2 pr-4 align-top">
                          <p className="font-medium">{row.organizerLabel}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.headlineCurrency}
                          </p>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatMoneyFromMinor(
                            row.headlineGrossProcessedMinor,
                            row.headlineCurrency,
                            locale,
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatMoneyFromMinor(
                            row.headlinePlatformFeeMinor,
                            row.headlineCurrency,
                            locale,
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatMoneyFromMinor(
                            row.headlineOrganizerProceedsMinor,
                            row.headlineCurrency,
                            locale,
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {row.captureCount.toLocaleString(locale)}
                        </td>
                        <td className="py-2 text-right">
                          <Button asChild variant="outline" size="sm" className="rounded-xl">
                            <a href={investigationHref}>{labels.organizerActionLabel}</a>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              asChild={Boolean(previousOrganizerHref)}
              variant="outline"
              size="sm"
              disabled={!previousOrganizerHref}
            >
              {previousOrganizerHref ? (
                <a href={previousOrganizerHref}>{labels.previousPageLabel}</a>
              ) : (
                <span>{labels.previousPageLabel}</span>
              )}
            </Button>
            <Button
              asChild={Boolean(nextOrganizerHref)}
              variant="outline"
              size="sm"
              disabled={!nextOrganizerHref}
            >
              {nextOrganizerHref ? (
                <a href={nextOrganizerHref}>{labels.nextPageLabel}</a>
              ) : (
                <span>{labels.nextPageLabel}</span>
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{labels.investigationTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{labels.investigationDescription}</p>
          <div className="mt-4">
            <Button asChild variant="outline" className="rounded-xl">
              <a href={investigationWorkspaceHref}>{labels.investigationActionLabel}</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
