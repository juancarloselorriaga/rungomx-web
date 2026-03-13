'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  PaymentsDataTable,
  PaymentsDataTableCell,
  PaymentsDataTableHead,
  PaymentsDataTableHeader,
  PaymentsDataTableRow,
} from '@/components/payments/payments-data-table';
import type {
  DailyFxRateRecord,
  FxRateActionFlags,
} from '@/lib/payments/economics/fx-rate-management';

type FxRateManagementLabels = {
  sectionTitle: string;
  sectionDescription: string;
  missingTitle: string;
  staleTitle: string;
  upsertTitle: string;
  upsertDescription: string;
  currencyFieldLabel: string;
  dateFieldLabel: string;
  rateFieldLabel: string;
  reasonFieldLabel: string;
  clearDateLabel: string;
  submitLabel: string;
  ratesTableTitle: string;
  ratesTableDescription: string;
  tableCurrencyHeader: string;
  tableDateHeader: string;
  tableRateHeader: string;
  tableReasonHeader: string;
  tableUpdatedHeader: string;
  editActionLabel: string;
  emptyRates: string;
  noActions: string;
  missingDatesLabel: string;
};

type FxRateManagementDashboardProps = {
  locale: 'es' | 'en';
  rates: DailyFxRateRecord[];
  flags: FxRateActionFlags;
  labels: FxRateManagementLabels;
  upsertAction: (formData: FormData) => void | Promise<void>;
  hideSummaryCards?: boolean;
};

function formatDate(value: Date, locale: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  }).format(value);
}

function formatRate(rateToMxn: number): string {
  return rateToMxn.toFixed(6);
}

export function FxRateManagementDashboard({
  locale,
  rates,
  flags,
  labels,
  upsertAction,
  hideSummaryCards = false,
}: FxRateManagementDashboardProps) {
  const [effectiveDate, setEffectiveDate] = useState('');

  return (
    <section className="space-y-4" data-testid="admin-payments-fx-dashboard">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{labels.sectionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.sectionDescription}</p>
      </div>

      {hideSummaryCards ? null : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.missingTitle}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{flags.missingRates.length}</p>
          </div>

          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.staleTitle}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{flags.staleRates.length}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        {flags.hasActions ? (
          <div className="space-y-3 text-sm">
            {flags.missingRates.map((entry) => (
              <div
                key={`missing-${entry.sourceCurrency}`}
                className="rounded border border-dashed p-3"
              >
                <p className="font-medium">
                  {labels.missingTitle}: {entry.sourceCurrency}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {labels.missingDatesLabel}: {entry.missingEventDates.join(', ')}
                </p>
              </div>
            ))}

            {flags.staleRates.map((entry) => (
              <div
                key={`stale-${entry.sourceCurrency}`}
                className="rounded border border-dashed p-3"
              >
                <p className="font-medium">
                  {labels.staleTitle}: {entry.sourceCurrency}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.latestEffectiveDate} ({entry.daysStale})
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{labels.noActions}</p>
        )}
      </div>

      <details className="rounded-xl border bg-card/80 p-4 shadow-sm" open={flags.hasActions}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{labels.upsertTitle}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{labels.upsertDescription}</p>
          </div>
          <span className="inline-flex rounded-md border px-3 py-1.5 text-sm font-medium">
            {labels.editActionLabel}
          </span>
        </summary>
        <form action={upsertAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              {labels.currencyFieldLabel}
            </span>
            <input
              name="sourceCurrency"
              required
              maxLength={3}
              placeholder="USD"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm uppercase"
            />
          </label>

          <label className="space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              {labels.dateFieldLabel}
            </span>
            <DatePicker
              value={effectiveDate}
              onChangeAction={setEffectiveDate}
              locale={locale}
              clearLabel={labels.clearDateLabel}
            />
            <input type="hidden" name="effectiveDate" value={effectiveDate} required readOnly />
          </label>

          <label className="space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              {labels.rateFieldLabel}
            </span>
            <input
              name="rateToMxn"
              required
              type="number"
              min="0.000001"
              step="0.000001"
              placeholder="17.250000"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm tabular-nums"
            />
          </label>

          <label className="space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              {labels.reasonFieldLabel}
            </span>
            <input
              name="reason"
              required
              minLength={3}
              maxLength={500}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>

          <div className="md:col-span-2 xl:col-span-4">
            <Button type="submit">
              {labels.submitLabel}
            </Button>
          </div>
        </form>
      </details>

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{labels.ratesTableTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.ratesTableDescription}</p>

        {rates.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{labels.emptyRates}</p>
        ) : (
          <PaymentsDataTable minWidthClassName="min-w-[48rem]">
              <PaymentsDataTableHead>
                <tr>
                  <PaymentsDataTableHeader>{labels.tableCurrencyHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.tableDateHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader align="right">{labels.tableRateHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.tableReasonHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.tableUpdatedHeader}</PaymentsDataTableHeader>
                </tr>
              </PaymentsDataTableHead>
              <tbody>
                {rates.map((rate) => (
                  <PaymentsDataTableRow key={rate.id}>
                    <PaymentsDataTableCell className="font-medium">{rate.sourceCurrency}</PaymentsDataTableCell>
                    <PaymentsDataTableCell className="whitespace-nowrap">
                      {formatDate(rate.effectiveDate, locale)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                      {formatRate(rate.rateToMxn)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell className="text-xs text-muted-foreground">
                      {rate.updatedReason ?? '—'}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(rate.updatedAt, locale)}
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
