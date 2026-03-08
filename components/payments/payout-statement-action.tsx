'use client';

import { Button } from '@/components/ui/button';
import { emitOrganizerPaymentsTelemetry } from '@/lib/payments/organizer/telemetry';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type PayoutStatementActionProps = {
  organizationId: string;
  payoutRequestId: string;
  isTerminal: boolean;
};

type StatementStatus = 'idle' | 'loading' | 'ready' | 'not_found' | 'not_terminal' | 'error';

export function PayoutStatementAction({
  organizationId,
  payoutRequestId,
  isTerminal,
}: PayoutStatementActionProps) {
  const t = useTranslations('pages.dashboardPayments');
  const [status, setStatus] = useState<StatementStatus>('idle');
  const [statementFingerprint, setStatementFingerprint] = useState<string | null>(null);
  const [isFingerprintVisible, setIsFingerprintVisible] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const requestStatement = async () => {
    setStatus('loading');
    setStatementFingerprint(null);
    setIsFingerprintVisible(false);
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
          data?: {
            statementFingerprint?: string;
          };
        };

        setStatementFingerprint(payload.data?.statementFingerprint ?? null);
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
    if (!statementFingerprint) return;

    try {
      await navigator.clipboard.writeText(statementFingerprint);
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
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void requestStatement()}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? t('home.shell.loadingTitle') : t('actions.viewStatement')}
          </Button>
        </div>
      )}

      {statusMessage ? <p className="text-sm text-muted-foreground">{statusMessage}</p> : null}

      {statementFingerprint ? (
        <div className="space-y-3 rounded-lg border bg-background/80 p-4">
          <p className="text-sm text-muted-foreground">{t('detail.statement.fingerprintDescription')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsFingerprintVisible((current) => !current)}
            >
              {isFingerprintVisible
                ? t('detail.statement.hideFingerprint')
                : t('detail.statement.showFingerprint')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyFingerprint()}
              disabled={!isFingerprintVisible}
            >
              {copyStatus === 'copied'
                ? t('detail.statement.copySuccess')
                : t('detail.statement.copyAction')}
            </Button>
          </div>

          {copyStatus === 'error' ? (
            <p className="text-xs text-destructive">{t('detail.statement.copyError')}</p>
          ) : null}

          {isFingerprintVisible ? (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('detail.statement.fingerprintLabel')}
              </p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {statementFingerprint}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
