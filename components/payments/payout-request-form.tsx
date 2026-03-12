'use client';

import { Link } from '@/i18n/navigation';
import { getPayoutDetailHref } from '@/lib/payments/organizer/hrefs';
import { emitOrganizerPaymentsTelemetry } from '@/lib/payments/organizer/telemetry';
import {
  getOrganizerPayoutReasonFamily,
  humanizeTechnicalCode,
} from '@/lib/payments/organizer/presentation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useRef, useState } from 'react';
import {
  PaymentsEyebrow,
  PaymentsMetricLabel,
  PaymentsMetricValue,
  PaymentsMonoValue,
  PaymentsSectionDescription,
  PaymentsSectionTitle,
} from './payments-typography';

type PayoutRequestFormProps = {
  organizationId: string;
  presentation?: 'card' | 'dialog';
  eventId?: string;
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

type RequestedAmountParseResult =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'valid'; value: number };

function createIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}`;
}

function parseRequestedAmount(rawValue: string): RequestedAmountParseResult {
  const trimmed = rawValue.trim();
  if (!trimmed) return { kind: 'empty' };

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return { kind: 'invalid' };
  }

  return { kind: 'valid', value: parsed };
}

export function PayoutRequestForm({
  organizationId,
  presentation = 'card',
  eventId,
}: PayoutRequestFormProps) {
  const t = useTranslations('pages.dashboardPayments');
  const locale = useLocale() as 'en' | 'es';
  const [requestedAmount, setRequestedAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQueueSubmitting, setIsQueueSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingQueueAmountMinor, setPendingQueueAmountMinor] = useState<number | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<PayoutRequestSuccess | null>(null);
  const [queueSuccess, setQueueSuccess] = useState<QueueIntentSuccess | null>(null);
  const submitInFlightRef = useRef(false);
  const queueSubmitInFlightRef = useRef(false);

  const submitPayoutRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Keep a sync in-flight lock to guard against double-click races before state updates flush.
    if (submitInFlightRef.current || queueSubmitInFlightRef.current) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const requestedAmountResult = parseRequestedAmount(
      String(formData.get('requestedAmountMinor') ?? ''),
    );

    if (requestedAmountResult.kind === 'invalid') {
      setErrorMessage(t('request.errors.invalidAmount'));
      return;
    }

    const requestedAmountMinor =
      requestedAmountResult.kind === 'valid' ? requestedAmountResult.value : null;

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
          requestedAmountMinor: requestedAmountMinor ?? undefined,
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
    <section
      className={cn(
        'space-y-5',
        presentation === 'card' ? 'rounded-2xl border bg-card/80 p-5 shadow-sm sm:p-6' : '',
      )}
    >
      {presentation === 'card' ? (
        <div className="space-y-2">
          <PaymentsEyebrow>{t('home.nextStep.eyebrow')}</PaymentsEyebrow>
          <PaymentsSectionTitle compact>{t('request.title')}</PaymentsSectionTitle>
          <PaymentsSectionDescription>{t('request.description')}</PaymentsSectionDescription>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={submitPayoutRequest}>
        <div
          className={cn(
            'grid gap-4',
            presentation === 'dialog'
              ? 'lg:grid-cols-[minmax(0,1fr)_16rem]'
              : 'xl:grid-cols-[minmax(0,1fr)_16rem]',
          )}
        >
          <div className="space-y-3">
            <label htmlFor="requestedAmountMinor" className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('request.amountLabel')}
              </span>
              <input
                id="requestedAmountMinor"
                name="requestedAmountMinor"
                type="number"
                min={1}
                step={1}
                value={requestedAmount}
                onChange={(event) => setRequestedAmount(event.target.value)}
                placeholder={t('request.amountPlaceholder')}
                className="h-14 w-full rounded-xl border bg-background px-4 text-2xl font-semibold tracking-tight tabular-nums shadow-sm"
              />
            </label>

            <div className="rounded-xl border bg-muted/20 px-4 py-3">
              <p className="text-sm text-foreground">{t('request.amountHint')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('request.amountExample')}</p>
            </div>
          </div>

          <aside className="rounded-xl border bg-muted/25 px-4 py-4">
            <PaymentsEyebrow>{t('home.nextStep.eyebrow')}</PaymentsEyebrow>
            <div className="mt-3 space-y-3">
              <p className="text-sm font-medium text-foreground">{t('request.submitHint')}</p>
              <p className="text-sm text-muted-foreground">{t('request.queuedHint')}</p>
            </div>
          </aside>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="submit"
            disabled={isSubmitting || isQueueSubmitting}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? t('home.shell.loadingTitle') : t('actions.requestPayout')}
          </Button>

          {pendingQueueAmountMinor != null ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void submitQueueIntent()}
              disabled={isSubmitting || isQueueSubmitting}
              className="w-full sm:w-auto"
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
        <div className="space-y-4 rounded-xl border bg-background/80 p-4 sm:p-5">
          <div className="space-y-1">
            <p className="font-medium">{t('request.successTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('request.successDescription')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 px-4 py-3">
              <PaymentsMetricLabel>{t('request.summary.requestedAmount')}</PaymentsMetricLabel>
              <PaymentsMetricValue className="mt-2">
                {formatMoneyFromMinor(requestSuccess.requestedAmountMinor, 'MXN', locale)}
              </PaymentsMetricValue>
            </div>
            <div className="rounded-lg border bg-muted/20 px-4 py-3">
              <PaymentsMetricLabel>{t('request.summary.maxWithdrawable')}</PaymentsMetricLabel>
              <PaymentsMetricValue compact className="mt-2">
                {formatMoneyFromMinor(requestSuccess.maxWithdrawableAmountMinor, 'MXN', locale)}
              </PaymentsMetricValue>
            </div>
          </div>
          <details className="rounded-lg border bg-muted/25 px-3 py-3">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              {t('request.technicalDetailsLabel')}
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-muted-foreground">
                {t('request.summary.requestId')} <PaymentsMonoValue as="span">{requestSuccess.payoutRequestId}</PaymentsMonoValue>
              </p>
              <p className="text-muted-foreground">
                {t('request.summary.quoteId')} <PaymentsMonoValue as="span">{requestSuccess.payoutQuoteId}</PaymentsMonoValue>
              </p>
              <p className="text-muted-foreground">
                {t('request.summary.contractId')} <PaymentsMonoValue as="span">{requestSuccess.payoutContractId}</PaymentsMonoValue>
              </p>
            </div>
          </details>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={getPayoutDetailHref(requestSuccess.payoutRequestId, { eventId })}>
              {t('actions.openDetails')}
            </Link>
          </Button>
        </div>
      ) : null}

      {queueSuccess ? (
        <div className="space-y-4 rounded-xl border bg-background/80 p-4 sm:p-5">
          <div className="space-y-1">
            <p className="font-medium">{t('request.queueSuccessTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('request.queueSuccessDescription')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 px-4 py-3">
              <PaymentsMetricLabel>{t('request.summary.requestedAmount')}</PaymentsMetricLabel>
              <PaymentsMetricValue className="mt-2">
                {formatMoneyFromMinor(queueSuccess.requestedAmountMinor, 'MXN', locale)}
              </PaymentsMetricValue>
            </div>
            <div className="rounded-lg border bg-muted/20 px-4 py-3">
              <PaymentsMetricLabel>{t('request.summary.blockedReasonHuman')}</PaymentsMetricLabel>
              <p className="mt-2 text-sm font-medium leading-6">
                {t(`detail.reasonFamilies.${getOrganizerPayoutReasonFamily(queueSuccess.blockedReasonCode)}`)}
              </p>
            </div>
          </div>
          <details className="rounded-lg border bg-muted/25 px-3 py-3">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              {t('request.technicalDetailsLabel')}
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-muted-foreground">
                {t('request.summary.queueIntentId')} {' '}
                <PaymentsMonoValue as="span">{queueSuccess.payoutQueuedIntentId}</PaymentsMonoValue>
              </p>
              <p className="text-muted-foreground">
                {t('request.summary.blockedReason')} {' '}
                <PaymentsMonoValue as="span">
                  {humanizeTechnicalCode(queueSuccess.blockedReasonCode)}
                </PaymentsMonoValue>
              </p>
              <p className="text-muted-foreground">
                {t('request.summary.rawBlockedReason')} {' '}
                <PaymentsMonoValue as="span">{queueSuccess.blockedReasonCode}</PaymentsMonoValue>
              </p>
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
