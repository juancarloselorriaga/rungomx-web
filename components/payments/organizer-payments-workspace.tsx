'use client';

import { Link } from '@/i18n/navigation';
import type { AppHref } from '@/lib/payments/organizer/hrefs';
import { getGlobalPayoutHistoryHref, getPayoutDetailHref } from '@/lib/payments/organizer/hrefs';
import { emitOrganizerPaymentsTelemetry } from '@/lib/payments/organizer/telemetry';
import {
  type OrganizerWalletIssuesApiResponse,
  type OrganizerWalletSnapshotApiResponse,
} from '@/lib/payments/organizer/ui';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { OrganizerActionQueue } from './organizer-action-queue';
import { PaymentsStatePanel } from './payments-state-panel';
import { OrganizerWalletSummary } from './organizer-wallet-summary';
import { PaymentsWorkspaceSkeleton } from './payments-page-skeletons';
import { PayoutRequestDialog } from './payout-request-dialog';
import { PaymentsInsetPanel, PaymentsMutedPanel, PaymentsPanel } from './payments-surfaces';
import {
  PaymentsEyebrow,
  PaymentsSectionDescription,
  PaymentsSectionTitle,
} from './payments-typography';

type OrganizerPaymentsWorkspaceProps = {
  locale: 'es' | 'en';
  organizationId: string;
  organizationName?: string;
  historyHref?: AppHref;
  eventId?: string;
  showHistoryShortcut?: boolean;
  initialData?: WorkspaceData | null;
};

type WorkspaceData = {
  wallet: OrganizerWalletSnapshotApiResponse['data'] | null;
  issues: OrganizerWalletIssuesApiResponse['data'] | null;
};

type WorkspaceStatus = 'ready' | 'partial' | 'error';

export function OrganizerPaymentsWorkspace({
  locale,
  organizationId,
  organizationName = '',
  historyHref,
  eventId,
  showHistoryShortcut = true,
  initialData,
}: OrganizerPaymentsWorkspaceProps) {
  const t = useTranslations('pages.dashboardPayments');
  const resolvedHistoryHref = historyHref ?? getGlobalPayoutHistoryHref(organizationId);
  const [data, setData] = useState<WorkspaceData | null>(initialData ?? null);
  const [isLoading, setIsLoading] = useState(initialData === undefined);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>(() => {
    if (initialData === undefined) return 'ready';
    if (!initialData) return 'error';
    return initialData.wallet && initialData.issues ? 'ready' : 'partial';
  });
  const hasEmittedTelemetryRef = useRef(false);

  useEffect(() => {
    if (initialData === undefined) {
      setData(null);
      setIsLoading(true);
      setWorkspaceStatus('ready');
      return;
    }

    setData(initialData);
    setIsLoading(false);
    if (!initialData) {
      setWorkspaceStatus('error');
      return;
    }
    setWorkspaceStatus(initialData.wallet && initialData.issues ? 'ready' : 'partial');
  }, [organizationId, initialData]);

  const loadWorkspaceData = useCallback(async () => {
    setIsLoading(true);
    setWorkspaceStatus('ready');

    try {
      const [walletResult, issuesResult] = await Promise.allSettled([
        (async () => {
          const walletResponse = await fetch(
            `/api/payments/wallet?organizationId=${encodeURIComponent(organizationId)}`,
            {
              cache: 'no-store',
            },
          );
          if (!walletResponse.ok) {
            throw new Error('payments_workspace_wallet_fetch_failed');
          }
          return (await walletResponse.json()) as OrganizerWalletSnapshotApiResponse;
        })(),
        (async () => {
          const issuesResponse = await fetch(
            `/api/payments/wallet/issues?organizationId=${encodeURIComponent(organizationId)}`,
            {
              cache: 'no-store',
            },
          );
          if (!issuesResponse.ok) {
            throw new Error('payments_workspace_issues_fetch_failed');
          }
          return (await issuesResponse.json()) as OrganizerWalletIssuesApiResponse;
        })(),
      ]);

      const nextData: WorkspaceData = {
        wallet: walletResult.status === 'fulfilled' ? walletResult.value.data : null,
        issues: issuesResult.status === 'fulfilled' ? issuesResult.value.data : null,
      };

      if (!nextData.wallet && !nextData.issues) {
        setData(null);
        setWorkspaceStatus('error');
        return;
      }

      setData(nextData);
      setWorkspaceStatus(nextData.wallet && nextData.issues ? 'ready' : 'partial');
    } catch {
      setWorkspaceStatus('error');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (initialData !== undefined) {
      return;
    }
    void loadWorkspaceData();
  }, [initialData, loadWorkspaceData]);

  useEffect(() => {
    hasEmittedTelemetryRef.current = false;
  }, [organizationId]);

  useEffect(() => {
    if (hasEmittedTelemetryRef.current || !data) {
      return;
    }
    emitOrganizerPaymentsTelemetry({
      eventName: 'organizer_payments_workspace_viewed',
      organizationId,
    });
    hasEmittedTelemetryRef.current = true;
  }, [data, organizationId]);

  if (isLoading) {
    return (
      <PaymentsWorkspaceSkeleton
        showContextCard={false}
        loadingAriaLabel={t('home.shell.loadingAriaLabel')}
      />
    );
  }

  if (workspaceStatus === 'error' || !data) {
    return (
      <PaymentsStatePanel
        title={t('home.shell.degradedTitle')}
        description={t('home.shell.degradedDescription')}
        tone="warning"
        action={<Button onClick={() => void loadWorkspaceData()}>{t('actions.retry')}</Button>}
      />
    );
  }

  const activePayoutId = data.issues
    ? ([...data.issues.actionNeeded, ...data.issues.inProgress].find(
        (item) => item.entityType === 'payout',
      )?.entityId ?? null)
    : null;
  const isPartial = workspaceStatus === 'partial';
  const isWalletUnavailable = data.wallet == null;
  const ctaState =
    data.wallet && (data.wallet.buckets.processingMinor > 0 || activePayoutId)
      ? 'active'
      : data.wallet && data.wallet.buckets.availableMinor > 0
        ? 'request'
        : 'idle';
  const currentPayoutHref = activePayoutId
    ? getPayoutDetailHref(activePayoutId, { eventId })
    : resolvedHistoryHref;

  return (
    <div className="space-y-6">
      {isPartial ? (
        <PaymentsStatePanel
          title={t('home.shell.partialTitle')}
          description={
            isWalletUnavailable
              ? t('home.shell.partialWalletDescription')
              : t('home.shell.partialQueueDescription')
          }
          tone="warning"
          action={
            <Button variant="outline" onClick={() => void loadWorkspaceData()}>
              {t('actions.retry')}
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.9fr)] xl:gap-6">
        {data.wallet ? (
          <OrganizerWalletSummary
            asOf={data.wallet.asOf}
            buckets={data.wallet.buckets}
            locale={locale}
          />
        ) : (
          <PaymentsStatePanel
            eyebrow={t('wallet.title')}
            title={t('home.shell.partialTitle')}
            description={t('home.shell.partialWalletDescription')}
            dashed
            className="bg-card/70"
          />
        )}

        <PaymentsPanel className="p-5 sm:p-6">
          <div className="space-y-4 sm:space-y-5">
            <div className="space-y-1">
              <PaymentsEyebrow>{t('home.nextStep.eyebrow')}</PaymentsEyebrow>
              <PaymentsSectionTitle className="text-xl sm:text-[1.65rem]">
                {ctaState === 'request'
                  ? t('home.nextStep.requestTitle')
                  : ctaState === 'active'
                    ? t('home.nextStep.queueTitle')
                    : t('home.nextStep.idleTitle')}
              </PaymentsSectionTitle>
              <PaymentsSectionDescription>
                {ctaState === 'request'
                  ? t('home.nextStep.requestDescription', { organization: organizationName })
                  : ctaState === 'active'
                    ? t('home.nextStep.queueDescription', { organization: organizationName })
                    : t('home.nextStep.idleDescription', { organization: organizationName })}
              </PaymentsSectionDescription>
            </div>

            <div className="flex flex-col gap-3">
              {isWalletUnavailable ? (
                <PaymentsMutedPanel className="border-dashed py-4 text-sm text-muted-foreground">
                  {t('home.shell.partialWalletDescription')}
                </PaymentsMutedPanel>
              ) : ctaState === 'request' ? (
                <PayoutRequestDialog
                  organizationId={organizationId}
                  triggerLabel={t('actions.requestPayout')}
                  triggerTestId="payments-primary-cta"
                  eventId={eventId}
                  triggerClassName="w-full justify-center"
                />
              ) : ctaState === 'active' ? (
                <Button asChild className="w-full justify-center">
                  <Link href={currentPayoutHref} data-testid="payments-current-payout-link">
                    {t('actions.viewCurrentPayout')}
                  </Link>
                </Button>
              ) : (
                <Button asChild className="w-full justify-center">
                  <Link href={resolvedHistoryHref} data-testid="payments-history-link">
                    {t('actions.viewPayouts')}
                  </Link>
                </Button>
              )}

              {!isWalletUnavailable && ctaState === 'active' ? (
                <PayoutRequestDialog
                  organizationId={organizationId}
                  triggerLabel={t('actions.queuePayoutRequest')}
                  triggerVariant="outline"
                  triggerTestId="payments-primary-cta"
                  eventId={eventId}
                  triggerClassName="w-full justify-center"
                />
              ) : null}

              {!isWalletUnavailable && ctaState !== 'idle' && showHistoryShortcut ? (
                <PaymentsInsetPanel className="flex items-center justify-center py-3">
                  <Link
                    href={resolvedHistoryHref}
                    data-testid="payments-history-shortcut-link"
                    className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    {t('actions.viewPayouts')}
                  </Link>
                </PaymentsInsetPanel>
              ) : null}
            </div>
          </div>
        </PaymentsPanel>
      </div>

      {data.issues ? (
        <OrganizerActionQueue
          locale={locale}
          actionNeeded={data.issues.actionNeeded}
          inProgress={data.issues.inProgress}
          eventId={eventId}
        />
      ) : (
        <PaymentsStatePanel
          title={t('wallet.queue.title')}
          description={t('home.shell.partialQueueDescription')}
          dashed
          className="bg-card/70"
          action={
            <Button variant="outline" onClick={() => void loadWorkspaceData()}>
              {t('actions.retry')}
            </Button>
          }
        />
      )}
    </div>
  );
}
