'use client';

import { Link } from '@/i18n/navigation';
import { emitOrganizerPaymentsTelemetry } from '@/lib/payments/organizer/telemetry';
import {
  resolveOrganizerPayoutCtaMode,
  type OrganizerWalletIssuesApiResponse,
  type OrganizerWalletSnapshotApiResponse,
} from '@/lib/payments/organizer/ui';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { OrganizerActionQueue } from './organizer-action-queue';
import { OrganizerWalletSummary } from './organizer-wallet-summary';
import { PayoutRequestDialog } from './payout-request-dialog';

type OrganizerPaymentsWorkspaceProps = {
  locale: 'es' | 'en';
  organizationId: string;
  organizationName?: string;
};

type WorkspaceData = {
  wallet: OrganizerWalletSnapshotApiResponse['data'];
  issues: OrganizerWalletIssuesApiResponse['data'];
};

export function OrganizerPaymentsWorkspace({
  locale,
  organizationId,
  organizationName = '',
}: OrganizerPaymentsWorkspaceProps) {
  const t = useTranslations('pages.dashboardPayments');
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
    return (
      <section className="rounded-lg border bg-card p-6 shadow-sm" role="status" aria-live="polite">
        <h2 className="text-lg font-semibold">{t('home.shell.loadingTitle')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('home.shell.loadingDescription')}</p>
      </section>
    );
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

  const ctaMode = resolveOrganizerPayoutCtaMode(data.wallet.buckets);

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
                {ctaMode === 'request'
                  ? t('home.nextStep.requestTitle')
                  : t('home.nextStep.queueTitle')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {ctaMode === 'request'
                  ? t('home.nextStep.requestDescription', { organization: organizationName })
                  : t('home.nextStep.queueDescription', { organization: organizationName })}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {ctaMode === 'request' ? (
                <PayoutRequestDialog
                  organizationId={organizationId}
                  triggerLabel={t('actions.requestPayout')}
                  triggerTestId="payments-primary-cta"
                />
              ) : (
                <Button asChild variant="outline">
                  <Link
                    href={{
                      pathname: '/dashboard/payments/payouts',
                      query: { organizationId },
                    }}
                  >
                    {t('actions.viewPayouts')}
                  </Link>
                </Button>
              )}

              <div className="flex flex-wrap gap-2">
                {ctaMode === 'request' ? (
                  <Button asChild variant="outline">
                    <Link
                      href={{
                        pathname: '/dashboard/payments/payouts',
                        query: { organizationId },
                      }}
                    >
                      {t('actions.viewPayouts')}
                    </Link>
                  </Button>
                ) : (
                  <PayoutRequestDialog
                    organizationId={organizationId}
                    triggerLabel={t('actions.queuePayoutRequest')}
                    triggerVariant="outline"
                    triggerTestId="payments-primary-cta"
                  />
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <OrganizerActionQueue
        locale={locale}
        actionNeeded={data.issues.actionNeeded}
        inProgress={data.issues.inProgress}
      />
    </div>
  );
}
