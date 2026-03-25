'use client';

import {
  queueOrganizerPayoutIntentAction,
  requestOrganizerPayoutAction,
} from '@/app/actions/payments-organizer-payouts';
import { FormField } from '@/components/ui/form-field';
import { Link } from '@/i18n/navigation';
import { Form, FormError, useForm } from '@/lib/forms';
import { getPayoutDetailHref } from '@/lib/payments/organizer/hrefs';
import { emitOrganizerPaymentsTelemetry } from '@/lib/payments/organizer/telemetry';
import {
  getOrganizerPayoutRequestErrorKey,
  getOrganizerPayoutReasonFamily,
} from '@/lib/payments/organizer/presentation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
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

type RequestErrorPayload = {
  code?: string;
  reasonCode?: string;
};

function readRequestedAmountMinor(rawValue: string): number | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function resolveLocalizedRequestError(
  t: ReturnType<typeof useTranslations>,
  payload: RequestErrorPayload,
): string {
  const errorKey = getOrganizerPayoutRequestErrorKey(payload.reasonCode ?? payload.code);

  if (errorKey) {
    return t(`request.errors.${errorKey}`);
  }

  return t('request.errors.unknownAction');
}

export function PayoutRequestForm({
  organizationId,
  presentation = 'card',
  eventId,
}: PayoutRequestFormProps) {
  const t = useTranslations('pages.dashboardPayments');
  const locale = useLocale() as 'en' | 'es';
  const [isQueueSubmitting, setIsQueueSubmitting] = useState(false);
  const [queueErrorMessage, setQueueErrorMessage] = useState<string | null>(null);
  const [pendingQueueAmountMinor, setPendingQueueAmountMinor] = useState<number | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<PayoutRequestSuccess | null>(null);
  const [queueSuccess, setQueueSuccess] = useState<QueueIntentSuccess | null>(null);
  const inFlightRequestRef = useRef<Promise<
    | { ok: true; data: PayoutRequestSuccess }
    | { ok: false; error: string; message?: string; fieldErrors?: Record<string, string[]> }
  > | null>(null);
  const form = useForm<{ requestedAmountMinor: string }, PayoutRequestSuccess>({
    defaultValues: {
      requestedAmountMinor: '',
    },
    onSubmit: async (values) => {
      if (inFlightRequestRef.current) {
        return inFlightRequestRef.current;
      }

      setQueueErrorMessage(null);
      setQueueSuccess(null);
      setRequestSuccess(null);
      setPendingQueueAmountMinor(null);

      const requestPromise = (async () => {
        const result = await requestOrganizerPayoutAction({
          organizationId,
          requestedAmountMinor: values.requestedAmountMinor,
        });

        if (!result.ok) {
          if (result.error === 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED') {
            setPendingQueueAmountMinor(readRequestedAmountMinor(values.requestedAmountMinor));
            return {
              ok: false as const,
              error: 'INVALID_INPUT',
              message: t('request.conflictDescription'),
            };
          }

          const fieldErrors =
            result.error === 'INVALID_INPUT' && 'fieldErrors' in result
              ? result.fieldErrors
              : undefined;
          const message =
            typeof result.error === 'string' && result.error.startsWith('PAYOUT_')
              ? resolveLocalizedRequestError(t, { code: result.error })
              : (result.message ?? t('request.errors.submitFailed'));
          return {
            ok: false as const,
            error: result.error,
            message,
            ...(fieldErrors ? { fieldErrors } : {}),
          };
        }

        return result;
      })();

      inFlightRequestRef.current = requestPromise;
      try {
        return await requestPromise;
      } finally {
        inFlightRequestRef.current = null;
      }
    },
    onSuccess: (data) => {
      setRequestSuccess(data);
      emitOrganizerPaymentsTelemetry({
        eventName: 'organizer_payout_request_submitted',
        organizationId,
        payoutRequestId: data.payoutRequestId,
        requestedAmountMinor: data.requestedAmountMinor,
      });
    },
  });

  const submitQueueIntent = async () => {
    if (isQueueSubmitting || form.isSubmitting) {
      return;
    }

    if (pendingQueueAmountMinor == null) {
      setQueueErrorMessage(t('request.errors.queueRequiresAmount'));
      return;
    }

    setQueueErrorMessage(null);
    setIsQueueSubmitting(true);

    try {
      const result = await queueOrganizerPayoutIntentAction({
        organizationId,
        requestedAmountMinor: pendingQueueAmountMinor,
      });

      if (result.ok) {
        setQueueSuccess(result.data);
        setPendingQueueAmountMinor(null);
        emitOrganizerPaymentsTelemetry({
          eventName: 'organizer_payout_queue_intent_submitted',
          organizationId,
          payoutQueuedIntentId: result.data.payoutQueuedIntentId,
          requestedAmountMinor: result.data.requestedAmountMinor,
        });
        return;
      }

      const message =
        typeof result.error === 'string' && result.error.startsWith('PAYOUT_')
          ? resolveLocalizedRequestError(t, { code: result.error })
          : (result.message ?? t('request.errors.queueFailed'));
      setQueueErrorMessage(message);
    } catch {
      setQueueErrorMessage(t('request.errors.queueFailed'));
    } finally {
      setIsQueueSubmitting(false);
    }
  };

  return (
    <section
      className={cn(
        'space-y-5',
        presentation === 'card' ? 'rounded-2xl border bg-card/80 p-4 shadow-sm sm:p-6' : '',
      )}
    >
      {presentation === 'card' ? (
        <div className="space-y-2">
          <PaymentsEyebrow>{t('home.nextStep.eyebrow')}</PaymentsEyebrow>
          <PaymentsSectionTitle compact>{t('request.title')}</PaymentsSectionTitle>
          <PaymentsSectionDescription>{t('request.description')}</PaymentsSectionDescription>
        </div>
      ) : null}

      <Form form={form} className="space-y-4">
        <FormError />
        <div
          className={cn(
            'grid gap-4',
            presentation === 'dialog'
              ? 'lg:grid-cols-[minmax(0,1fr)_16rem]'
              : 'xl:grid-cols-[minmax(0,1fr)_16rem]',
          )}
        >
          <div className="space-y-3">
            <FormField
              label={t('request.amountLabel')}
              error={form.errors.requestedAmountMinor}
              className="space-y-2"
            >
              <input
                id="requestedAmountMinor"
                type="number"
                min={1}
                step={1}
                placeholder={t('request.amountPlaceholder')}
                className="h-14 w-full rounded-xl border bg-background px-4 text-3xl font-semibold tracking-tight tabular-nums shadow-sm sm:text-[2rem]"
                {...form.register('requestedAmountMinor')}
                disabled={form.isSubmitting || isQueueSubmitting}
              />
            </FormField>

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
            disabled={form.isSubmitting || isQueueSubmitting}
            className="w-full sm:w-auto"
          >
            {form.isSubmitting ? t('request.submittingAction') : t('actions.requestPayout')}
          </Button>

          {pendingQueueAmountMinor != null ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void submitQueueIntent()}
              disabled={form.isSubmitting || isQueueSubmitting}
              className="w-full sm:w-auto"
            >
              {isQueueSubmitting ? t('request.queueSubmittingAction') : t('actions.queuePayoutRequest')}
            </Button>
          ) : null}
        </div>
      </Form>

      {queueErrorMessage ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {queueErrorMessage}
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
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
