'use client';

import { Button } from '@/components/ui/button';
import { emitOrganizerPaymentsTelemetry } from '@/lib/payments/organizer/telemetry';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type PayoutStatementActionProps = {
  locale: 'es' | 'en';
  organizationId: string;
  payoutRequestId: string;
  isTerminal: boolean;
};

type StatementStatus = 'idle' | 'loading' | 'ready' | 'not_found' | 'not_terminal' | 'error';

type StatementResponse = {
  payoutStatus: 'completed' | 'failed';
  statementFingerprint: string;
  originalRequestedAmountMinor: number;
  currentRequestedAmountMinor: number;
  terminalAmountMinor: number;
  adjustmentTotalMinor: number;
  generatedAt: string;
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function PayoutStatementAction({
  locale,
  organizationId,
  payoutRequestId,
  isTerminal,
}: PayoutStatementActionProps) {
  const t = useTranslations('pages.dashboardPayments');
  const [status, setStatus] = useState<StatementStatus>('idle');
  const [statement, setStatement] = useState<StatementResponse | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const requestStatement = async () => {
    setStatus('loading');
    setStatement(null);
    setCopyStatus('idle');
    emitOrganizerPaymentsTelemetry({
      eventName: 'organizer_payout_statement_requested',
      organizationId,
      payoutRequestId,
      isTerminal,
    });

    try {
      const response = await fetch(
        `/api/payments/payouts/${encodeURIComponent(payoutRequestId)}/statement?organizationId=${encodeURIComponent(organizationId)}`,
        {
          cache: 'no-store',
        },
      );

      if (response.ok) {
        const payload = (await response.json()) as {
          data?: StatementResponse;
        };

        setStatement(payload.data ?? null);
        setStatus('ready');
        return;
      }

      if (response.status === 404) {
        setStatus('not_found');
        return;
      }

      if (response.status === 409) {
        setStatus('not_terminal');
        return;
      }

      setStatus('error');
    } catch {
      setStatus('error');
    }
  };

  const statusMessage =
    status === 'ready'
      ? t('detail.statement.ready')
      : status === 'not_found'
        ? t('detail.statement.notFound')
        : status === 'not_terminal'
          ? t('detail.statement.notTerminal')
          : status === 'error'
            ? t('detail.statement.error')
            : null;

  const copyFingerprint = async () => {
    if (!statement?.statementFingerprint) return;

    try {
      await navigator.clipboard.writeText(statement.statementFingerprint);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  };

  return (
    <section className="rounded-xl border bg-card/80 p-6 shadow-sm space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('detail.statement.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('detail.statement.description')}</p>
      </div>

      {!isTerminal ? (
        <p className="text-sm text-muted-foreground">{t('detail.statement.notTerminal')}</p>
      ) : !statement ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void requestStatement()}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? t('detail.statement.loadingAction') : t('actions.viewStatement')}
          </Button>
        </div>
      ) : null}

      {statusMessage ? <p className="text-sm text-muted-foreground">{statusMessage}</p> : null}

      {statement ? (
        <div className="space-y-4 rounded-lg border bg-background/80 p-4">
          <div className="space-y-1">
            <p className="font-medium">{t('detail.statement.summaryTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('detail.statement.summaryDescription')}</p>
          </div>

          <dl className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">{t('detail.statement.finalStatusLabel')}</dt>
              <dd className="font-medium">{t(`payouts.statuses.${statement.payoutStatus}`)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('detail.statement.finalAmountLabel')}</dt>
              <dd className="font-medium">
                {formatMoneyFromMinor(statement.terminalAmountMinor, 'MXN', locale)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('detail.statement.requestedAmountLabel')}</dt>
              <dd className="font-medium">
                {formatMoneyFromMinor(statement.originalRequestedAmountMinor, 'MXN', locale)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('detail.statement.generatedAtLabel')}</dt>
              <dd className="font-medium">{formatDate(statement.generatedAt, locale)}</dd>
            </div>
          </dl>

          {statement.originalRequestedAmountMinor !== statement.terminalAmountMinor ? (
            <p className="text-sm text-muted-foreground">
              {t('detail.statement.adjustedSummary', {
                original: formatMoneyFromMinor(statement.originalRequestedAmountMinor, 'MXN', locale),
                terminal: formatMoneyFromMinor(statement.terminalAmountMinor, 'MXN', locale),
              })}
            </p>
          ) : null}

          <details className="rounded-lg border bg-muted/20 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              {t('detail.statement.technicalDetailsLabel')}
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('detail.statement.fingerprintDescription')}
              </p>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('detail.statement.fingerprintLabel')}
                </p>
                <p className="break-all rounded-md border bg-background/80 px-3 py-2 font-mono text-xs text-muted-foreground">
                  {statement.statementFingerprint}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void copyFingerprint()}>
                  {copyStatus === 'copied'
                    ? t('detail.statement.copySuccess')
                    : t('detail.statement.copyAction')}
                </Button>
              </div>

              {copyStatus === 'error' ? (
                <p className="text-xs text-destructive">{t('detail.statement.copyError')}</p>
              ) : null}
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
