'use client';

import { useState } from 'react';

import {
  type ArtifactGovernanceActionResult,
  listArtifactGovernanceSummaryAdminAction,
  runArtifactGovernanceAdminAction,
} from '@/app/actions/admin-payments-artifacts';
import { Form, FormError, useForm } from '@/lib/forms';
import type {
  ArtifactDeliveryRecord,
  ArtifactGovernanceSummary,
  ArtifactVersionRecord,
} from '@/lib/payments/artifacts/governance';
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
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';

type ArtifactGovernanceLabels = {
  sectionTitle: string;
  sectionDescription: string;
  formTitle: string;
  formDescription: string;
  operationActionLabel: string;
  operationFieldLabel: string;
  operationRebuildLabel: string;
  operationResendLabel: string;
  traceFieldLabel: string;
  artifactTypeFieldLabel: string;
  artifactTypePayoutStatementLabel: string;
  artifactVersionFieldLabel: string;
  reasonFieldLabel: string;
  submitLabel: string;
  refreshLabel: string;
  refreshingLabel: string;
  submittingLabel: string;
  successPrefix: string;
  policyDeniedPrefix: string;
  genericErrorMessage: string;
  errorMessages: Record<string, string>;
  recentVersionsTitle: string;
  recentVersionsDescription: string;
  recentDeliveriesTitle: string;
  recentDeliveriesDescription: string;
  versionsEmpty: string;
  deliveriesEmpty: string;
  versionTraceHeader: string;
  versionNumberHeader: string;
  versionFingerprintHeader: string;
  versionLineageHeader: string;
  versionLineageRootLabel: string;
  versionLineageFromPrefixLabel: string;
  versionReasonHeader: string;
  versionRequestedByHeader: string;
  versionCreatedAtHeader: string;
  deliveryTraceHeader: string;
  deliveryVersionHeader: string;
  deliveryChannelHeader: string;
  deliveryRecipientHeader: string;
  deliveryReasonHeader: string;
  deliveryRequestedByHeader: string;
  deliveryCreatedAtHeader: string;
  operationSelectAriaLabel: string;
};

type ArtifactGovernanceDashboardProps = {
  locale: 'es' | 'en';
  initialSummary: ArtifactGovernanceSummary;
  labels: ArtifactGovernanceLabels;
};

type FeedbackState =
  | {
      kind: 'success';
      message: string;
    }
  | {
      kind: 'error';
      message: string;
    }
  | null;

type GovernanceOperation = 'rebuild' | 'resend';
type ArtifactGovernanceFormValues = {
  operation: GovernanceOperation;
  traceId: string;
  artifactType: 'payout_statement';
  artifactVersion: string;
  reasonCode: string;
};

function normalizeDate(value: Date | string): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: Date | string, locale: 'es' | 'en'): string {
  const dateValue = normalizeDate(value);
  if (!dateValue) return '—';

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(dateValue);
}

function formatLineageValue(
  row: ArtifactVersionRecord,
  labels: Pick<
    ArtifactGovernanceLabels,
    'versionLineageFromPrefixLabel' | 'versionLineageRootLabel'
  >,
): string {
  return row.rebuiltFromVersionId
    ? `${labels.versionLineageFromPrefixLabel} ${truncateMiddle(row.rebuiltFromVersionId)}`
    : labels.versionLineageRootLabel;
}

function renderOperationValue(
  labels: ArtifactGovernanceLabels,
  operation: GovernanceOperation,
): string {
  return operation === 'rebuild' ? labels.operationRebuildLabel : labels.operationResendLabel;
}

function resolveArtifactGovernanceErrorMessage(
  labels: ArtifactGovernanceLabels,
  code: string | null | undefined,
  fallbackCode = 'UNKNOWN_ERROR',
): string {
  const normalized = code?.trim() || fallbackCode;
  return labels.errorMessages[normalized] ?? labels.errorMessages[fallbackCode];
}

function translateArtifactGovernanceFieldErrors(
  labels: ArtifactGovernanceLabels,
  fieldErrors: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([field, codes]) => [
      field,
      codes.map((code) =>
        resolveArtifactGovernanceErrorMessage(labels, code, 'VALIDATION_FAILED'),
      ),
    ]),
  );
}

function versionSortKey(value: ArtifactVersionRecord): string {
  return `${value.traceId}:${value.artifactVersion.toString().padStart(8, '0')}:${value.id}`;
}

function deliverySortKey(value: ArtifactDeliveryRecord): string {
  return `${value.traceId}:${value.id}`;
}

function truncateMiddle(value: string | null | undefined, start = 10, end = 6): string {
  if (!value) return '—';
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

export function ArtifactGovernanceDashboard({
  locale,
  initialSummary,
  labels,
}: ArtifactGovernanceDashboardProps) {
  const [summary, setSummary] = useState<ArtifactGovernanceSummary>(initialSummary);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  async function refreshSummary(): Promise<void> {
    setIsRefreshing(true);
    const result = await listArtifactGovernanceSummaryAdminAction();
    if (result.ok) {
      setSummary(result.data);
    } else {
      setFeedback({
        kind: 'error',
        message: labels.genericErrorMessage,
      });
    }
    setIsRefreshing(false);
  }

  const form = useForm<ArtifactGovernanceFormValues, ArtifactGovernanceActionResult>({
    defaultValues: {
      operation: 'rebuild',
      traceId: '',
      artifactType: 'payout_statement',
      artifactVersion: '',
      reasonCode: '',
    },
    onSubmit: async (values) => {
      setFeedback(null);

      const result = await runArtifactGovernanceAdminAction({
        operation: values.operation,
        traceId: values.traceId,
        artifactType: values.artifactType,
        reasonCode: values.reasonCode,
        artifactVersion:
          values.operation === 'resend' && values.artifactVersion.trim().length > 0
            ? Number(values.artifactVersion)
            : undefined,
      });

      if (!result.ok) {
        if (result.error === 'INVALID_INPUT') {
          const fieldErrors =
            'fieldErrors' in result && result.fieldErrors
              ? translateArtifactGovernanceFieldErrors(labels, result.fieldErrors)
              : undefined;

          return {
            ok: false as const,
            error: result.error,
            fieldErrors,
            message: resolveArtifactGovernanceErrorMessage(
              labels,
              result.message,
              'VALIDATION_FAILED',
            ),
          };
        }

        const detail = resolveArtifactGovernanceErrorMessage(
          labels,
          result.error || 'UNKNOWN_ERROR',
        );
        return {
          ok: false,
          error: result.error,
          message: `${labels.policyDeniedPrefix}: ${detail}`,
        };
      }

      return result;
    },
    onSuccess: (data) => {
      setFeedback({
        kind: 'success',
        message: `${labels.successPrefix}: ${renderOperationValue(labels, data.operation)} • ${data.traceId}`,
      });

      form.setFieldValue('reasonCode', '');
      if (data.operation === 'rebuild') {
        form.setFieldValue('artifactVersion', '');
      }

      void refreshSummary();
    },
  });

  const sortedVersions = [...summary.versions].sort((left, right) =>
    versionSortKey(right).localeCompare(versionSortKey(left)),
  );
  const sortedDeliveries = [...summary.deliveries].sort((left, right) =>
    deliverySortKey(right).localeCompare(deliverySortKey(left)),
  );

  return (
    <section className="space-y-4" data-testid="admin-payments-artifact-governance-dashboard">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{labels.sectionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.sectionDescription}</p>
      </div>

      <details className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{labels.formTitle}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{labels.formDescription}</p>
          </div>
          <span className="inline-flex rounded-md border px-3 py-1.5 text-sm font-medium">
            {labels.operationActionLabel}
          </span>
        </summary>

        <Form form={form} className="mt-4 grid gap-3 md:grid-cols-2">
          <FormError className="md:col-span-2" />

          <FormField
            label={
              <span className="uppercase tracking-wide text-muted-foreground">
                {labels.operationFieldLabel}
              </span>
            }
            className="space-y-1 text-xs"
          >
            <select
              {...form.register('operation')}
              aria-label={labels.operationSelectAriaLabel}
              data-testid="artifact-operation-select"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="rebuild">{labels.operationRebuildLabel}</option>
              <option value="resend">{labels.operationResendLabel}</option>
            </select>
          </FormField>

          <FormField
            label={
              <span className="uppercase tracking-wide text-muted-foreground">
                {labels.traceFieldLabel}
              </span>
            }
            required
            error={form.errors.traceId}
            className="space-y-1 text-xs md:col-span-2"
          >
            <input
              {...form.register('traceId')}
              required
              maxLength={128}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </FormField>

          <FormField
            label={
              <span className="uppercase tracking-wide text-muted-foreground">
                {labels.artifactTypeFieldLabel}
              </span>
            }
            className="space-y-1 text-xs"
          >
            <select
              {...form.register('artifactType')}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="payout_statement">{labels.artifactTypePayoutStatementLabel}</option>
            </select>
          </FormField>

          <FormField
            label={
              <span className="uppercase tracking-wide text-muted-foreground">
                {labels.artifactVersionFieldLabel}
              </span>
            }
            error={form.errors.artifactVersion}
            className="space-y-1 text-xs"
          >
            <input
              {...form.register('artifactVersion')}
              disabled={form.values.operation !== 'resend'}
              min={1}
              step={1}
              type="number"
              placeholder="1"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm tabular-nums disabled:opacity-60"
            />
          </FormField>

          <FormField
            label={
              <span className="uppercase tracking-wide text-muted-foreground">
                {labels.reasonFieldLabel}
              </span>
            }
            required
            error={form.errors.reasonCode}
            className="space-y-1 text-xs md:col-span-2"
          >
            <input
              {...form.register('reasonCode')}
              required
              minLength={3}
              maxLength={100}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </FormField>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" disabled={form.isSubmitting}>
              {form.isSubmitting ? labels.submittingLabel : labels.submitLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isRefreshing}
              onClick={refreshSummary}
            >
              {isRefreshing ? labels.refreshingLabel : labels.refreshLabel}
            </Button>
          </div>
        </Form>

        {feedback ? (
          <p
            className={
              feedback.kind === 'success'
                ? 'mt-3 text-xs text-emerald-700'
                : 'mt-3 text-xs text-destructive'
            }
          >
            {feedback.message}
          </p>
        ) : null}
      </details>

      <PaymentsPanel>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{labels.recentVersionsTitle}</h3>
          <PaymentsCountPill>{sortedVersions.length}</PaymentsCountPill>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{labels.recentVersionsDescription}</p>
        {sortedVersions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{labels.versionsEmpty}</p>
        ) : (
          <>
            <PaymentsResponsiveList className="mt-4">
              {sortedVersions.map((version) => (
                <PaymentsResponsiveListItem key={version.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-xs">{truncateMiddle(version.traceId)}</p>
                    <PaymentsCountPill>{String(version.artifactVersion)}</PaymentsCountPill>
                  </div>
                  <PaymentsResponsiveListGrid className="mt-4">
                    <div className="col-span-2">
                      <PaymentsResponsiveListLabel>{labels.versionFingerprintHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="font-mono text-xs">
                        {truncateMiddle(version.fingerprint)}
                      </PaymentsResponsiveListValue>
                    </div>
                    <div className="col-span-2">
                      <PaymentsResponsiveListLabel>{labels.versionLineageHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="text-xs text-muted-foreground">
                        {formatLineageValue(version, labels)}
                      </PaymentsResponsiveListValue>
                    </div>
                    <div>
                      <PaymentsResponsiveListLabel>{labels.versionReasonHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="text-xs">{version.reasonCode}</PaymentsResponsiveListValue>
                    </div>
                    <div>
                      <PaymentsResponsiveListLabel>{labels.versionCreatedAtHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="text-xs text-muted-foreground">
                        {formatDate(version.createdAt, locale)}
                      </PaymentsResponsiveListValue>
                    </div>
                    <div className="col-span-2">
                      <PaymentsResponsiveListLabel>{labels.versionRequestedByHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="font-mono text-xs">
                        {truncateMiddle(version.requestedByUserId)}
                      </PaymentsResponsiveListValue>
                    </div>
                  </PaymentsResponsiveListGrid>
                </PaymentsResponsiveListItem>
              ))}
            </PaymentsResponsiveList>
            <div className="hidden md:block">
              <PaymentsDataTable minWidthClassName="min-w-[64rem]">
              <PaymentsDataTableHead>
                <tr>
                  <PaymentsDataTableHeader>{labels.versionTraceHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.versionNumberHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.versionFingerprintHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.versionLineageHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.versionReasonHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.versionRequestedByHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.versionCreatedAtHeader}</PaymentsDataTableHeader>
                </tr>
              </PaymentsDataTableHead>
              <tbody>
                {sortedVersions.map((version) => (
                  <PaymentsDataTableRow key={version.id}>
                    <PaymentsDataTableCell className="font-mono text-xs whitespace-nowrap" title={version.traceId}>
                      {truncateMiddle(version.traceId)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell className="tabular-nums whitespace-nowrap">
                      {version.artifactVersion}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell className="font-mono text-xs whitespace-nowrap" title={version.fingerprint}>
                      {truncateMiddle(version.fingerprint)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell
                      className="text-xs text-muted-foreground"
                      title={version.rebuiltFromVersionId ?? labels.versionLineageRootLabel}
                    >
                      {formatLineageValue(version, labels)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell className="text-xs">{version.reasonCode}</PaymentsDataTableCell>
                    <PaymentsDataTableCell className="font-mono text-xs whitespace-nowrap" title={version.requestedByUserId}>
                      {truncateMiddle(version.requestedByUserId)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(version.createdAt, locale)}
                    </PaymentsDataTableCell>
                  </PaymentsDataTableRow>
                ))}
              </tbody>
              </PaymentsDataTable>
            </div>
          </>
        )}
      </PaymentsPanel>

      <PaymentsPanel>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{labels.recentDeliveriesTitle}</h3>
          <PaymentsCountPill>{sortedDeliveries.length}</PaymentsCountPill>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{labels.recentDeliveriesDescription}</p>
        {sortedDeliveries.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{labels.deliveriesEmpty}</p>
        ) : (
          <>
            <PaymentsResponsiveList className="mt-4">
              {sortedDeliveries.map((delivery) => (
                <PaymentsResponsiveListItem key={delivery.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{delivery.channel}</p>
                    <PaymentsCountPill>{truncateMiddle(delivery.artifactVersionId, 8, 4)}</PaymentsCountPill>
                  </div>
                  <PaymentsResponsiveListGrid className="mt-4">
                    <div className="col-span-2">
                      <PaymentsResponsiveListLabel>{labels.deliveryTraceHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="font-mono text-xs">
                        {truncateMiddle(delivery.traceId)}
                      </PaymentsResponsiveListValue>
                    </div>
                    <div>
                      <PaymentsResponsiveListLabel>{labels.deliveryRecipientHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="text-xs text-muted-foreground">
                        {truncateMiddle(delivery.recipientReference, 14, 6)}
                      </PaymentsResponsiveListValue>
                    </div>
                    <div>
                      <PaymentsResponsiveListLabel>{labels.deliveryReasonHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="text-xs">
                        {delivery.reasonCode}
                      </PaymentsResponsiveListValue>
                    </div>
                    <div className="col-span-2">
                      <PaymentsResponsiveListLabel>{labels.deliveryRequestedByHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="font-mono text-xs">
                        {truncateMiddle(delivery.requestedByUserId)}
                      </PaymentsResponsiveListValue>
                    </div>
                    <div className="col-span-2">
                      <PaymentsResponsiveListLabel>{labels.deliveryCreatedAtHeader}</PaymentsResponsiveListLabel>
                      <PaymentsResponsiveListValue className="text-xs text-muted-foreground">
                        {formatDate(delivery.createdAt, locale)}
                      </PaymentsResponsiveListValue>
                    </div>
                  </PaymentsResponsiveListGrid>
                </PaymentsResponsiveListItem>
              ))}
            </PaymentsResponsiveList>
            <div className="hidden md:block">
              <PaymentsDataTable minWidthClassName="min-w-[64rem]">
              <PaymentsDataTableHead>
                <tr>
                  <PaymentsDataTableHeader>{labels.deliveryTraceHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.deliveryVersionHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.deliveryChannelHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.deliveryRecipientHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.deliveryReasonHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.deliveryRequestedByHeader}</PaymentsDataTableHeader>
                  <PaymentsDataTableHeader>{labels.deliveryCreatedAtHeader}</PaymentsDataTableHeader>
                </tr>
              </PaymentsDataTableHead>
              <tbody>
                {sortedDeliveries.map((delivery) => (
                  <PaymentsDataTableRow key={delivery.id}>
                    <PaymentsDataTableCell className="font-mono text-xs whitespace-nowrap" title={delivery.traceId}>
                      {truncateMiddle(delivery.traceId)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell className="font-mono text-xs whitespace-nowrap" title={delivery.artifactVersionId}>
                      {truncateMiddle(delivery.artifactVersionId)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell className="text-xs whitespace-nowrap">{delivery.channel}</PaymentsDataTableCell>
                    <PaymentsDataTableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {truncateMiddle(delivery.recipientReference, 14, 6)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell className="text-xs">{delivery.reasonCode}</PaymentsDataTableCell>
                    <PaymentsDataTableCell className="font-mono text-xs whitespace-nowrap" title={delivery.requestedByUserId}>
                      {truncateMiddle(delivery.requestedByUserId)}
                    </PaymentsDataTableCell>
                    <PaymentsDataTableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(delivery.createdAt, locale)}
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
