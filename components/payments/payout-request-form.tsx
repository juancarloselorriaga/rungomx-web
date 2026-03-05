'use client';

import { Link } from '@/i18n/navigation';
import { emitOrganizerPaymentsTelemetry } from '@/lib/payments/organizer/telemetry';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { FormEvent, useMemo, useRef, useState } from 'react';

type PayoutRequestFormProps = {
  organizationId: string;
};

type PayoutRequestSuccess = {
  payoutQuoteId: string;
  payoutRequestId: string;
  payoutContractId: string;
  maxWithdrawableAmountMinor: number;
  requestedAmountMinor: number;
};

type QueueIntentSuccess = {
  payoutQueuedIntentId: string;
  requestedAmountMinor: number;
  blockedReasonCode: string;
};

function createIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}`;
}

function parseRequestedAmount(rawValue: string): number | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function formatMoney(minor: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

export function PayoutRequestForm({ organizationId }: PayoutRequestFormProps) {
  const t = useTranslations('pages.dashboardPayments');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQueueSubmitting, setIsQueueSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingQueueAmountMinor, setPendingQueueAmountMinor] = useState<number | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<PayoutRequestSuccess | null>(null);
  const [queueSuccess, setQueueSuccess] = useState<QueueIntentSuccess | null>(null);
  const submitInFlightRef = useRef(false);
  const queueSubmitInFlightRef = useRef(false);

  const requestedAmountMinor = useMemo(
    () => parseRequestedAmount(requestedAmount),
    [requestedAmount],
  );

  const submitPayoutRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Keep a sync in-flight lock to guard against double-click races before state updates flush.
    if (submitInFlightRef.current || queueSubmitInFlightRef.current) {
      return;
    }

    if (requestedAmountMinor == null) {
      setErrorMessage(t('request.errors.invalidAmount'));
      return;
    }

    submitInFlightRef.current = true;
    setErrorMessage(null);
    setQueueSuccess(null);
    setRequestSuccess(null);
    setPendingQueueAmountMinor(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/payments/payouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId,
          requestedAmountMinor,
          idempotencyKey: createIdempotencyKey('organizer-request'),
          activeConflictPolicy: 'queue',
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        reason?: string;
        suggestedAction?: string;
        data?: {
          payoutQuoteId: string;
          payoutRequestId: string;
          payoutContractId: string;
          maxWithdrawableAmountMinor: number;
          requestedAmountMinor: number;
        };
      };

      if (response.ok && payload.data) {
        setRequestSuccess(payload.data);
        emitOrganizerPaymentsTelemetry({
          eventName: 'organizer_payout_request_submitted',
          organizationId,
          payoutRequestId: payload.data.payoutRequestId,
          requestedAmountMinor: payload.data.requestedAmountMinor,
        });
        return;
      }

      const isActiveConflict =
        response.status === 409 &&
        (payload.suggestedAction === 'submit_queue_intent' ||
          payload.code === 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED' ||
          payload.code === 'PAYOUT_REQUEST_ACTIVE_CONFLICT_REJECTED');

      if (isActiveConflict) {
        setPendingQueueAmountMinor(requestedAmountMinor);
        setErrorMessage(t('request.conflictDescription'));
        return;
      }

      setErrorMessage(payload.reason || t('request.errors.submitFailed'));
    } catch {
      setErrorMessage(t('request.errors.submitFailed'));
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const submitQueueIntent = async () => {
    if (queueSubmitInFlightRef.current || submitInFlightRef.current) {
      return;
    }

    if (pendingQueueAmountMinor == null) {
      setErrorMessage(t('request.errors.queueRequiresAmount'));
      return;
    }

    queueSubmitInFlightRef.current = true;
    setErrorMessage(null);
    setIsQueueSubmitting(true);

    try {
      const response = await fetch('/api/payments/payouts/queued-intents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId,
          requestedAmountMinor: pendingQueueAmountMinor,
          idempotencyKey: createIdempotencyKey('organizer-queue'),
        }),
      });

      const payload = (await response.json()) as {
        reason?: string;
        data?: {
          payoutQueuedIntentId: string;
          requestedAmountMinor: number;
          blockedReasonCode: string;
        };
      };

      if (response.ok && payload.data) {
        setQueueSuccess(payload.data);
        setPendingQueueAmountMinor(null);
        emitOrganizerPaymentsTelemetry({
          eventName: 'organizer_payout_queue_intent_submitted',
          organizationId,
          payoutQueuedIntentId: payload.data.payoutQueuedIntentId,
          requestedAmountMinor: payload.data.requestedAmountMinor,
        });
        return;
      }

      setErrorMessage(payload.reason || t('request.errors.queueFailed'));
    } catch {
      setErrorMessage(t('request.errors.queueFailed'));
    } finally {
      queueSubmitInFlightRef.current = false;
      setIsQueueSubmitting(false);
    }
  };

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('request.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('request.description')}</p>
      </div>

      <form className="space-y-3" onSubmit={submitPayoutRequest}>
        <label htmlFor="requestedAmountMinor" className="block text-sm font-medium">
          {t('request.amountLabel')}
        </label>
        <input
          id="requestedAmountMinor"
          type="number"
          min={1}
          step={1}
          value={requestedAmount}
          onChange={(event) => setRequestedAmount(event.target.value)}
          placeholder="150000"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />

        <p className="text-xs text-muted-foreground">{t('request.amountHint')}</p>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting || isQueueSubmitting}>
            {isSubmitting ? t('home.shell.loadingTitle') : t('actions.requestPayout')}
          </Button>

          {pendingQueueAmountMinor != null ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void submitQueueIntent()}
              disabled={isSubmitting || isQueueSubmitting}
            >
              {isQueueSubmitting ? t('home.shell.loadingTitle') : t('actions.queuePayoutRequest')}
            </Button>
          ) : null}
        </div>
      </form>

      {errorMessage ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {errorMessage}
        </p>
      ) : null}

      {requestSuccess ? (
        <div className="rounded-md border bg-background p-4 space-y-2">
          <p className="font-medium">{t('request.successTitle')}</p>
          <p className="text-sm text-muted-foreground">
            {t('request.summary.requestId')} {requestSuccess.payoutRequestId}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('request.summary.quoteId')} {requestSuccess.payoutQuoteId}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('request.summary.contractId')} {requestSuccess.payoutContractId}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('request.summary.maxWithdrawable')}{' '}
            {formatMoney(requestSuccess.maxWithdrawableAmountMinor)}
          </p>
          <Button asChild variant="outline">
            <Link
              href={{
                pathname: '/dashboard/payments/payouts/[payoutRequestId]',
                params: { payoutRequestId: requestSuccess.payoutRequestId },
                query: { organizationId },
              }}
            >
              {t('actions.openDetails')}
            </Link>
          </Button>
        </div>
      ) : null}

      {queueSuccess ? (
        <div className="rounded-md border bg-background p-4 space-y-2">
          <p className="font-medium">{t('request.queueSuccessTitle')}</p>
          <p className="text-sm text-muted-foreground">
            {t('request.summary.queueIntentId')} {queueSuccess.payoutQueuedIntentId}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('request.summary.requestedAmount')}{' '}
            {formatMoney(queueSuccess.requestedAmountMinor)}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('request.summary.blockedReason')} {queueSuccess.blockedReasonCode}
          </p>
        </div>
      ) : null}
    </section>
  );
}
