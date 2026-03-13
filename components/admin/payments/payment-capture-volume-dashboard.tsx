import { Button } from '@/components/ui/button';
import { SampledReferenceList } from '@/components/admin/payments/sampled-reference-list';
import {
  PaymentsDataTable,
  PaymentsDataTableCell,
  PaymentsDataTableHead,
  PaymentsDataTableHeader,
  PaymentsDataTableMeta,
  PaymentsDataTableRow,
} from '@/components/payments/payments-data-table';
import {
  PaymentsMetricLabel,
  PaymentsMetricValue,
  PaymentsSectionDescription,
  PaymentsSectionTitle,
} from '@/components/payments/payments-typography';
import {
  PaymentsInsetPanel,
  PaymentsMutedPanel,
  PaymentsPanel,
} from '@/components/payments/payments-surfaces';
import type { PaymentCaptureVolumeMetrics } from '@/lib/payments/volume/payment-capture-volume';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';

type PaymentCaptureVolumeDashboardLabels = {
  sectionTitle: string;
  sectionDescription: string;
  mixedCurrencyNotice: (currency: string) => string;
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
  sampleTracesScopeLabel: (shown: number, total: number) => string;
  sampleTracesMoreLabel: (count: number) => string;
  topOrganizersTitle: string;
  topOrganizersDescription: string;
  organizerHeader: string;
  organizerGrossHeader: string;
  organizerFeesHeader: string;
  organizerProceedsHeader: string;
  organizerCountHeader: string;
  organizerActionHeader: string;
  organizerEmpty: string;
  organizerPageSummary: (params: { start: number; end: number; total: number }) => string;
  organizerPageStatus: (params: { page: number; pageCount: number }) => string;
  firstPageLabel: string;
  previousPageLabel: string;
  nextPageLabel: string;
  lastPageLabel: string;
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
  const firstOrganizerHref =
    metrics.organizerPagination.page > 1
      ? buildQueryHref({
          workspace: 'volume',
          organizerPage: '1',
        })
      : null;
  const nextOrganizerHref =
    metrics.organizerPagination.page < metrics.organizerPagination.pageCount
      ? buildQueryHref({
          workspace: 'volume',
          organizerPage: String(metrics.organizerPagination.page + 1),
        })
      : null;
  const lastOrganizerHref =
    metrics.organizerPagination.pageCount > 0 &&
    metrics.organizerPagination.page < metrics.organizerPagination.pageCount
      ? buildQueryHref({
          workspace: 'volume',
          organizerPage: String(metrics.organizerPagination.pageCount),
        })
      : null;
  const investigationWorkspaceHref = buildQueryHref({
    workspace: 'investigation',
    investigationTool: 'lookup',
    organizerPage: null,
    evidenceTraceId: null,
  });

  return (
    <section className="space-y-4" data-testid="admin-payments-volume-dashboard">
      <div>
        <PaymentsSectionTitle compact>{labels.sectionTitle}</PaymentsSectionTitle>
        <PaymentsSectionDescription className="mt-1">{labels.sectionDescription}</PaymentsSectionDescription>
        {showMixedCurrencyNotice ? (
          <p className="mt-2 text-xs text-muted-foreground">{labels.mixedCurrencyNotice(headlineCurrency)}</p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <PaymentsInsetPanel key={card.label} className="space-y-2">
            <PaymentsMetricLabel>{card.label}</PaymentsMetricLabel>
            <PaymentsMetricValue compact>{card.value}</PaymentsMetricValue>
            <p className="text-sm text-muted-foreground">{card.description}</p>
          </PaymentsInsetPanel>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <PaymentsPanel>
          <h3 className="text-sm font-semibold">{labels.currenciesTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{labels.currenciesDescription}</p>
          {metrics.currencies.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{labels.emptyCurrencies}</p>
          ) : (
            <PaymentsDataTable minWidthClassName="min-w-[34rem]">
                <PaymentsDataTableHead>
                  <tr>
                    <PaymentsDataTableHeader>{labels.currencyHeader}</PaymentsDataTableHeader>
                    <PaymentsDataTableHeader align="right">{labels.grossHeader}</PaymentsDataTableHeader>
                    <PaymentsDataTableHeader align="right">{labels.feesHeader}</PaymentsDataTableHeader>
                    <PaymentsDataTableHeader align="right">{labels.proceedsHeader}</PaymentsDataTableHeader>
                    <PaymentsDataTableHeader align="right">{labels.countHeader}</PaymentsDataTableHeader>
                  </tr>
                </PaymentsDataTableHead>
                <tbody>
                  {metrics.currencies.map((row) => (
                    <PaymentsDataTableRow key={row.sourceCurrency}>
                      <PaymentsDataTableCell className="font-medium">{row.sourceCurrency}</PaymentsDataTableCell>
                      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                        {formatMoneyFromMinor(row.grossProcessedMinor, row.sourceCurrency, locale)}
                      </PaymentsDataTableCell>
                      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                        {formatMoneyFromMinor(row.platformFeeMinor, row.sourceCurrency, locale)}
                      </PaymentsDataTableCell>
                      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                        {formatMoneyFromMinor(
                          row.organizerProceedsMinor,
                          row.sourceCurrency,
                          locale,
                        )}
                      </PaymentsDataTableCell>
                      <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                        {row.captureCount.toLocaleString(locale)}
                      </PaymentsDataTableCell>
                    </PaymentsDataTableRow>
                  ))}
                </tbody>
              </PaymentsDataTable>
          )}
        </PaymentsPanel>

        <PaymentsPanel>
          <h3 className="text-sm font-semibold">{labels.traceabilityTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{labels.traceabilityDescription}</p>
          <PaymentsMutedPanel className="mt-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {labels.traceabilityWindowLabel}
              </dt>
              <dd>
                {formatDateTime(metrics.traceability.windowStart, locale)} -{' '}
                {formatDateTime(metrics.traceability.windowEnd, locale)}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {labels.traceabilityEventsLabel}
              </dt>
              <dd className="tabular-nums">{metrics.traceability.eventCount}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {labels.traceabilityTracesLabel}
              </dt>
              <dd className="tabular-nums">{metrics.traceability.distinctTraceCount}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {labels.traceabilityExcludedLabel}
              </dt>
              <dd className="tabular-nums">{metrics.traceability.excludedEventCount}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {labels.traceabilityFirstEventLabel}
              </dt>
              <dd>{formatDateTime(metrics.traceability.firstOccurredAt, locale)}</dd>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {labels.traceabilityLastEventLabel}
              </dt>
              <dd>{formatDateTime(metrics.traceability.lastOccurredAt, locale)}</dd>
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
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <PaymentsPanel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">{labels.topOrganizersTitle}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {labels.topOrganizersDescription}
              </p>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="admin-payments-organizer-page-summary">
              {labels.organizerPageSummary({
                start: organizerStart,
                end: organizerEnd,
                total: metrics.organizerPagination.total,
              })}
            </p>
          </div>
          {metrics.organizerPagination.pageCount > 0 ? (
            <PaymentsMutedPanel className="mt-3 py-2.5 text-xs text-muted-foreground">
              {labels.organizerPageStatus({
                page: metrics.organizerPagination.page,
                pageCount: metrics.organizerPagination.pageCount,
              })}
            </PaymentsMutedPanel>
          ) : null}

          {metrics.organizers.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{labels.organizerEmpty}</p>
          ) : (
            <PaymentsDataTable minWidthClassName="min-w-[40rem]">
                <PaymentsDataTableHead>
                  <tr>
                    <PaymentsDataTableHeader>{labels.organizerHeader}</PaymentsDataTableHeader>
                    <PaymentsDataTableHeader align="right">{labels.organizerGrossHeader}</PaymentsDataTableHeader>
                    <PaymentsDataTableHeader align="right">{labels.organizerFeesHeader}</PaymentsDataTableHeader>
                    <PaymentsDataTableHeader align="right">{labels.organizerProceedsHeader}</PaymentsDataTableHeader>
                    <PaymentsDataTableHeader align="right">{labels.organizerCountHeader}</PaymentsDataTableHeader>
                    <PaymentsDataTableHeader align="right">{labels.organizerActionHeader}</PaymentsDataTableHeader>
                  </tr>
                </PaymentsDataTableHead>
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
                      <PaymentsDataTableRow key={row.organizerId ?? row.organizerLabel}>
                        <PaymentsDataTableCell>
                          <p className="font-medium">{row.organizerLabel}</p>
                          <PaymentsDataTableMeta>
                            {row.headlineCurrency}
                          </PaymentsDataTableMeta>
                        </PaymentsDataTableCell>
                        <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                          {formatMoneyFromMinor(
                            row.headlineGrossProcessedMinor,
                            row.headlineCurrency,
                            locale,
                          )}
                        </PaymentsDataTableCell>
                        <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                          {formatMoneyFromMinor(
                            row.headlinePlatformFeeMinor,
                            row.headlineCurrency,
                            locale,
                          )}
                        </PaymentsDataTableCell>
                        <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                          {formatMoneyFromMinor(
                            row.headlineOrganizerProceedsMinor,
                            row.headlineCurrency,
                            locale,
                          )}
                        </PaymentsDataTableCell>
                        <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                          {row.captureCount.toLocaleString(locale)}
                        </PaymentsDataTableCell>
                        <PaymentsDataTableCell align="right">
                          <Button asChild variant="outline" size="sm" className="rounded-xl">
                          <a href={investigationHref} data-testid="admin-payments-organizer-investigation-link">
                            {labels.organizerActionLabel}
                          </a>
                          </Button>
                        </PaymentsDataTableCell>
                      </PaymentsDataTableRow>
                    );
                  })}
                </tbody>
              </PaymentsDataTable>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button asChild={Boolean(firstOrganizerHref)} variant="outline" size="sm" disabled={!firstOrganizerHref}>
              {firstOrganizerHref ? (
                <a href={firstOrganizerHref}>{labels.firstPageLabel}</a>
              ) : (
                <span>{labels.firstPageLabel}</span>
              )}
            </Button>
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
            <Button asChild={Boolean(lastOrganizerHref)} variant="outline" size="sm" disabled={!lastOrganizerHref}>
              {lastOrganizerHref ? (
                <a href={lastOrganizerHref}>{labels.lastPageLabel}</a>
              ) : (
                <span>{labels.lastPageLabel}</span>
              )}
            </Button>
          </div>
        </PaymentsPanel>

        <PaymentsPanel className="flex h-full flex-col">
          <h3 className="text-sm font-semibold">{labels.investigationTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{labels.investigationDescription}</p>
          <div className="mt-4">
            <Button asChild variant="outline" className="rounded-xl">
              <a href={investigationWorkspaceHref} data-testid="admin-payments-open-investigation-workspace">
                {labels.investigationActionLabel}
              </a>
            </Button>
          </div>
        </PaymentsPanel>
      </div>
    </section>
  );
}
