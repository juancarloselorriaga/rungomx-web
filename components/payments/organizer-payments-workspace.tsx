'use client';

import { Link } from '@/i18n/navigation';
import type { AppHref } from '@/lib/payments/organizer/hrefs';
import {
  getGlobalPayoutHistoryHref,
  getPayoutDetailHref,
} from '@/lib/payments/organizer/hrefs';
import { emitOrganizerPaymentsTelemetry } from '@/lib/payments/organizer/telemetry';
import {
  type OrganizerWalletIssuesApiResponse,
  type OrganizerWalletSnapshotApiResponse,
} from '@/lib/payments/organizer/ui';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { OrganizerActionQueue } from './organizer-action-queue';
import { OrganizerWalletSummary } from './organizer-wallet-summary';
import { PaymentsWorkspaceSkeleton } from './payments-page-skeletons';
import { PayoutRequestDialog } from './payout-request-dialog';

type OrganizerPaymentsWorkspaceProps = {
  locale: 'es' | 'en';
  organizationId: string;
  organizationName?: string;
  historyHref?: AppHref;
  eventId?: string;
  showHistoryShortcut?: boolean;
};

type WorkspaceData = {
  wallet: OrganizerWalletSnapshotApiResponse['data'];
  issues: OrganizerWalletIssuesApiResponse['data'];
};

export function OrganizerPaymentsWorkspace({
  locale,
  organizationId,
  organizationName = '',
  historyHref,
  eventId,
  showHistoryShortcut = true,
}: OrganizerPaymentsWorkspaceProps) {
  const t = useTranslations('pages.dashboardPayments');
  const resolvedHistoryHref = historyHref ?? getGlobalPayoutHistoryHref(organizationId);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const loadWorkspaceData = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);

    try {
      const [walletResponse, issuesResponse] = await Promise.all([
        fetch(`/api/payments/wallet?organizationId=${encodeURIComponent(organizationId)}`, {
          cache: 'no-store',
        }),
        fetch(`/api/payments/wallet/issues?organizationId=${encodeURIComponent(organizationId)}`, {
          cache: 'no-store',
        }),
      ]);

      if (!walletResponse.ok || !issuesResponse.ok) {
        throw new Error('payments_workspace_fetch_failed');
      }

      const [walletPayload, issuesPayload] = (await Promise.all([
        walletResponse.json(),
        issuesResponse.json(),
      ])) as [OrganizerWalletSnapshotApiResponse, OrganizerWalletIssuesApiResponse];

      setData({
        wallet: walletPayload.data,
        issues: issuesPayload.data,
      });
      emitOrganizerPaymentsTelemetry({
        eventName: 'organizer_payments_workspace_viewed',
        organizationId,
      });
    } catch {
      setHasError(true);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  if (isLoading) {
    return <PaymentsWorkspaceSkeleton showContextCard={false} />;
  }

  if (hasError || !data) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t('home.shell.degradedTitle')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('home.shell.degradedDescription')}</p>
        <div className="mt-4">
          <Button onClick={() => void loadWorkspaceData()}>{t('actions.retry')}</Button>
        </div>
      </section>
    );
  }

  const activePayoutId =
    [...data.issues.actionNeeded, ...data.issues.inProgress].find(
      (item) => item.entityType === 'payout',
    )?.entityId ?? null;
  const ctaState =
    data.wallet.buckets.processingMinor > 0 || activePayoutId
      ? 'active'
      : data.wallet.buckets.availableMinor > 0
        ? 'request'
        : 'idle';
  const currentPayoutHref = activePayoutId
    ? getPayoutDetailHref(activePayoutId, { eventId })
    : resolvedHistoryHref;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.9fr)]">
        <OrganizerWalletSummary asOf={data.wallet.asOf} buckets={data.wallet.buckets} locale={locale} />

        <section className="rounded-xl border bg-card/80 p-5 shadow-sm">
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
                {t('home.nextStep.eyebrow')}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">
                {ctaState === 'request'
                  ? t('home.nextStep.requestTitle')
                  : ctaState === 'active'
                    ? t('home.nextStep.queueTitle')
                    : t('home.nextStep.idleTitle')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {ctaState === 'request'
                  ? t('home.nextStep.requestDescription', { organization: organizationName })
                  : ctaState === 'active'
                    ? t('home.nextStep.queueDescription', { organization: organizationName })
                    : t('home.nextStep.idleDescription', { organization: organizationName })}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {ctaState === 'request' ? (
                <PayoutRequestDialog
                  organizationId={organizationId}
                  triggerLabel={t('actions.requestPayout')}
                  triggerTestId="payments-primary-cta"
                  eventId={eventId}
                  triggerClassName="w-full justify-center"
                />
              ) : ctaState === 'active' ? (
                <Button asChild className="w-full justify-center">
                  <Link href={currentPayoutHref}>{t('actions.viewCurrentPayout')}</Link>
                </Button>
              ) : (
                <Button asChild className="w-full justify-center">
                  <Link href={resolvedHistoryHref}>{t('actions.viewPayouts')}</Link>
                </Button>
              )}

              {ctaState === 'active' ? (
                <PayoutRequestDialog
                  organizationId={organizationId}
                  triggerLabel={t('actions.queuePayoutRequest')}
                  triggerVariant="outline"
                  triggerTestId="payments-primary-cta"
                  eventId={eventId}
                  triggerClassName="w-full justify-center"
                />
              ) : null}

              {ctaState !== 'idle' && showHistoryShortcut ? (
                <div className="flex items-center justify-center">
                  <Link
                    href={resolvedHistoryHref}
                    className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    {t('actions.viewPayouts')}
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <OrganizerActionQueue
        locale={locale}
        actionNeeded={data.issues.actionNeeded}
        inProgress={data.issues.inProgress}
        eventId={eventId}
      />
    </div>
  );
}
