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

  const requestStatement = async () => {
    setStatus('loading');
    setStatementFingerprint(null);
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

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm space-y-3">
      <h2 className="text-lg font-semibold">{t('actions.viewStatement')}</h2>

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
        <p className="text-xs text-muted-foreground break-all">{statementFingerprint}</p>
      ) : null}
    </section>
  );
}
