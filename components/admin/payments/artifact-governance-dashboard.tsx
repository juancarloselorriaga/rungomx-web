'use client';

import { type FormEvent, useState } from 'react';

import {
  listArtifactGovernanceSummaryAdminAction,
  runArtifactGovernanceAdminAction,
} from '@/app/actions/admin-payments-artifacts';
import type {
  ArtifactDeliveryRecord,
  ArtifactGovernanceSummary,
  ArtifactVersionRecord,
} from '@/lib/payments/artifacts/governance';

type ArtifactGovernanceLabels = {
  sectionTitle: string;
  sectionDescription: string;
  formTitle: string;
  formDescription: string;
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

function formatLineageValue(row: ArtifactVersionRecord): string {
  return row.rebuiltFromVersionId ? `from ${row.rebuiltFromVersionId}` : 'root';
}

function renderOperationValue(
  labels: ArtifactGovernanceLabels,
  operation: GovernanceOperation,
): string {
  return operation === 'rebuild' ? labels.operationRebuildLabel : labels.operationResendLabel;
}

function versionSortKey(value: ArtifactVersionRecord): string {
  return `${value.traceId}:${value.artifactVersion.toString().padStart(8, '0')}:${value.id}`;
}

function deliverySortKey(value: ArtifactDeliveryRecord): string {
  return `${value.traceId}:${value.id}`;
}

export function ArtifactGovernanceDashboard({
  locale,
  initialSummary,
  labels,
}: ArtifactGovernanceDashboardProps) {
  const [summary, setSummary] = useState<ArtifactGovernanceSummary>(initialSummary);
  const [operation, setOperation] = useState<GovernanceOperation>('rebuild');
  const [traceId, setTraceId] = useState('');
  const [artifactType, setArtifactType] = useState<'payout_statement'>('payout_statement');
  const [artifactVersion, setArtifactVersion] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    const result = await runArtifactGovernanceAdminAction({
      operation,
      traceId,
      artifactType,
      reasonCode,
      artifactVersion: operation === 'resend' && artifactVersion.trim().length > 0
        ? Number(artifactVersion)
        : undefined,
    });

    if (!result.ok) {
      const code = result.error || 'UNKNOWN_ERROR';
      const detail = result.message || labels.genericErrorMessage;
      setFeedback({
        kind: 'error',
        message: `${labels.policyDeniedPrefix}: ${code} (${detail})`,
      });
      setIsSubmitting(false);
      return;
    }

    const successMessage = `${labels.successPrefix}: ${renderOperationValue(labels, result.data.operation)} • ${result.data.traceId}`;
    setFeedback({
      kind: 'success',
      message: successMessage,
    });

    setReasonCode('');
    if (operation === 'rebuild') {
      setArtifactVersion('');
    }

    await refreshSummary();
    setIsSubmitting(false);
  }

  const sortedVersions = [...summary.versions].sort((left, right) =>
    versionSortKey(right).localeCompare(versionSortKey(left)),
  );
  const sortedDeliveries = [...summary.deliveries].sort((left, right) =>
    deliverySortKey(right).localeCompare(deliverySortKey(left)),
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{labels.sectionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.sectionDescription}</p>
      </div>

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{labels.formTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.formDescription}</p>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              {labels.operationFieldLabel}
            </span>
            <select
              value={operation}
              onChange={(event) => setOperation(event.target.value as GovernanceOperation)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="rebuild">{labels.operationRebuildLabel}</option>
              <option value="resend">{labels.operationResendLabel}</option>
            </select>
          </label>

          <label className="space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              {labels.traceFieldLabel}
            </span>
            <input
              required
              maxLength={128}
              value={traceId}
              onChange={(event) => setTraceId(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              {labels.artifactTypeFieldLabel}
            </span>
            <select
              value={artifactType}
              onChange={(event) => setArtifactType(event.target.value as 'payout_statement')}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="payout_statement">{labels.artifactTypePayoutStatementLabel}</option>
            </select>
          </label>

          <label className="space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              {labels.artifactVersionFieldLabel}
            </span>
            <input
              value={artifactVersion}
              onChange={(event) => setArtifactVersion(event.target.value)}
              disabled={operation !== 'resend'}
              min={1}
              step={1}
              type="number"
              placeholder="1"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm tabular-nums disabled:opacity-60"
            />
          </label>

          <label className="space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              {labels.reasonFieldLabel}
            </span>
            <input
              required
              minLength={3}
              maxLength={100}
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>

          <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-5">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md border bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
            >
              {isSubmitting ? labels.submittingLabel : labels.submitLabel}
            </button>
            <button
              type="button"
              disabled={isRefreshing}
              onClick={refreshSummary}
              className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {isRefreshing ? labels.refreshingLabel : labels.refreshLabel}
            </button>
          </div>
        </form>

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
      </div>

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{labels.recentVersionsTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.recentVersionsDescription}</p>
        {sortedVersions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{labels.versionsEmpty}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-4">{labels.versionTraceHeader}</th>
                  <th className="pb-2 pr-4">{labels.versionNumberHeader}</th>
                  <th className="pb-2 pr-4">{labels.versionFingerprintHeader}</th>
                  <th className="pb-2 pr-4">{labels.versionLineageHeader}</th>
                  <th className="pb-2 pr-4">{labels.versionReasonHeader}</th>
                  <th className="pb-2 pr-4">{labels.versionRequestedByHeader}</th>
                  <th className="pb-2">{labels.versionCreatedAtHeader}</th>
                </tr>
              </thead>
              <tbody>
                {sortedVersions.map((version) => (
                  <tr key={version.id} className="border-t align-top">
                    <td className="py-2 pr-4 font-mono text-xs">{version.traceId}</td>
                    <td className="py-2 pr-4 tabular-nums">{version.artifactVersion}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{version.fingerprint}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {formatLineageValue(version)}
                    </td>
                    <td className="py-2 pr-4 text-xs">{version.reasonCode}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{version.requestedByUserId}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {formatDate(version.createdAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{labels.recentDeliveriesTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.recentDeliveriesDescription}</p>
        {sortedDeliveries.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{labels.deliveriesEmpty}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-4">{labels.deliveryTraceHeader}</th>
                  <th className="pb-2 pr-4">{labels.deliveryVersionHeader}</th>
                  <th className="pb-2 pr-4">{labels.deliveryChannelHeader}</th>
                  <th className="pb-2 pr-4">{labels.deliveryRecipientHeader}</th>
                  <th className="pb-2 pr-4">{labels.deliveryReasonHeader}</th>
                  <th className="pb-2 pr-4">{labels.deliveryRequestedByHeader}</th>
                  <th className="pb-2">{labels.deliveryCreatedAtHeader}</th>
                </tr>
              </thead>
              <tbody>
                {sortedDeliveries.map((delivery) => (
                  <tr key={delivery.id} className="border-t align-top">
                    <td className="py-2 pr-4 font-mono text-xs">{delivery.traceId}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{delivery.artifactVersionId}</td>
                    <td className="py-2 pr-4 text-xs">{delivery.channel}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {delivery.recipientReference || '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs">{delivery.reasonCode}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{delivery.requestedByUserId}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {formatDate(delivery.createdAt, locale)}
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
