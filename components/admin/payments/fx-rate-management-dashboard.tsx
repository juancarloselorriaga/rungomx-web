'use client';

import { useState } from 'react';

import { DatePicker } from '@/components/ui/date-picker';
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
  submitLabel: string;
  ratesTableTitle: string;
  ratesTableDescription: string;
  tableCurrencyHeader: string;
  tableDateHeader: string;
  tableRateHeader: string;
  tableReasonHeader: string;
  tableUpdatedHeader: string;
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
}: FxRateManagementDashboardProps) {
  const [effectiveDate, setEffectiveDate] = useState('');
  const clearDateLabel = locale === 'es' ? 'Limpiar' : 'Clear';

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{labels.sectionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.sectionDescription}</p>
      </div>

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

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{labels.upsertTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.upsertDescription}</p>
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
              clearLabel={clearDateLabel}
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
            <button
              type="submit"
              className="rounded-md border bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              {labels.submitLabel}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{labels.ratesTableTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.ratesTableDescription}</p>

        {rates.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{labels.emptyRates}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-4">{labels.tableCurrencyHeader}</th>
                  <th className="pb-2 pr-4">{labels.tableDateHeader}</th>
                  <th className="pb-2 pr-4 text-right">{labels.tableRateHeader}</th>
                  <th className="pb-2 pr-4">{labels.tableReasonHeader}</th>
                  <th className="pb-2">{labels.tableUpdatedHeader}</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr key={rate.id} className="border-t">
                    <td className="py-2 pr-4 font-medium">{rate.sourceCurrency}</td>
                    <td className="py-2 pr-4">{formatDate(rate.effectiveDate, locale)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatRate(rate.rateToMxn)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {rate.updatedReason ?? '—'}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {formatDate(rate.updatedAt, locale)}
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
