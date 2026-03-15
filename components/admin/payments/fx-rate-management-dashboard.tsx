'use client';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FormField } from '@/components/ui/form-field';
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
import { PaymentsInsetPanel, PaymentsPanel } from '@/components/payments/payments-surfaces';
import { Form, FormError, useForm } from '@/lib/forms';
import type { FormActionResult } from '@/lib/forms';
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
  upsertAction: (input: {
    sourceCurrency: string;
    effectiveDate: string;
    rateToMxn: string;
    reason: string;
  }) => Promise<FormActionResult<{ rateId: string }>>;
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
  const form = useForm<
    { sourceCurrency: string; effectiveDate: string; rateToMxn: string; reason: string },
    { rateId: string }
  >({
    defaultValues: {
      sourceCurrency: '',
      effectiveDate: '',
      rateToMxn: '',
      reason: '',
    },
    onSubmit: async (values) => {
      const result = await upsertAction({
        sourceCurrency: values.sourceCurrency,
        effectiveDate: values.effectiveDate,
        rateToMxn: values.rateToMxn,
        reason: values.reason,
      });

      if (!result.ok) {
        return {
          ...result,
          message: result.message ?? result.error,
        };
      }

      return result;
    },
  });

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

      <PaymentsInsetPanel>
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
      </PaymentsInsetPanel>

      <details className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6" open={flags.hasActions}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{labels.upsertTitle}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{labels.upsertDescription}</p>
          </div>
          <span className="inline-flex rounded-md border px-3 py-1.5 text-sm font-medium">
            {labels.editActionLabel}
          </span>
        </summary>
        <Form form={form} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2 xl:col-span-4">
            <FormError />
          </div>

          <FormField
            label={labels.currencyFieldLabel}
            required
            error={form.errors.sourceCurrency}
            className="space-y-1 text-xs"
          >
            <input
              required
              maxLength={3}
              placeholder="USD"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm uppercase"
              {...form.register('sourceCurrency')}
              disabled={form.isSubmitting}
            />
          </FormField>

          <FormField
            label={labels.dateFieldLabel}
            required
            error={form.errors.effectiveDate}
            className="space-y-1 text-xs"
          >
            <DatePicker
              value={form.values.effectiveDate}
              onChangeAction={(value) => form.setFieldValue('effectiveDate', value)}
              locale={locale}
              clearLabel={labels.clearDateLabel}
              disabled={form.isSubmitting}
            />
          </FormField>

          <FormField
            label={labels.rateFieldLabel}
            required
            error={form.errors.rateToMxn}
            className="space-y-1 text-xs"
          >
            <input
              required
              type="number"
              min="0.000001"
              step="0.000001"
              placeholder="17.250000"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm tabular-nums"
              {...form.register('rateToMxn')}
              disabled={form.isSubmitting}
            />
          </FormField>

          <FormField
            label={labels.reasonFieldLabel}
            required
            error={form.errors.reason}
            className="space-y-1 text-xs"
          >
            <input
              required
              minLength={3}
              maxLength={500}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              {...form.register('reason')}
              disabled={form.isSubmitting}
            />
          </FormField>

          <div className="md:col-span-2 xl:col-span-4">
            <Button type="submit" disabled={form.isSubmitting}>
              {labels.submitLabel}
            </Button>
          </div>
        </Form>
      </details>

      <PaymentsPanel>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{labels.ratesTableTitle}</h3>
          <PaymentsCountPill>{rates.length}</PaymentsCountPill>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{labels.ratesTableDescription}</p>

        {rates.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{labels.emptyRates}</p>
        ) : (
          <>
            <PaymentsResponsiveList className="mt-4">
              {rates.map((rate) => (
                <PaymentsResponsiveListItem key={rate.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{rate.sourceCurrency}</p>
                    <PaymentsCountPill>{formatRate(rate.rateToMxn)}</PaymentsCountPill>
                  </div>
                  <PaymentsResponsiveListGrid className="mt-4">
                    <div>
                      <PaymentsResponsiveListLabel>{labels.tableDateHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue>{formatDate(rate.effectiveDate, locale)}</PaymentsResponsiveListValue>
                    </div>
                    <div>
                      <PaymentsResponsiveListLabel>{labels.tableRateHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="font-medium tabular-nums">
                        {formatRate(rate.rateToMxn)}
                      </PaymentsResponsiveListValue>
                    </div>
                    <div className="col-span-2">
                      <PaymentsResponsiveListLabel>{labels.tableReasonHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="text-xs text-muted-foreground">
                        {rate.updatedReason ?? '—'}
                      </PaymentsResponsiveListValue>
                    </div>
                    <div className="col-span-2">
                      <PaymentsResponsiveListLabel>{labels.tableUpdatedHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="text-xs text-muted-foreground">
                        {formatDate(rate.updatedAt, locale)}
                      </PaymentsResponsiveListValue>
                    </div>
                  </PaymentsResponsiveListGrid>
                </PaymentsResponsiveListItem>
              ))}
            </PaymentsResponsiveList>
            <div className="hidden md:block">
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
            </div>
          </>
        )}
      </PaymentsPanel>
    </section>
  );
}
