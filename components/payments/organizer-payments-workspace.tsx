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

type OrganizerPaymentsWorkspaceProps = {
  locale: 'es' | 'en';
  organizationId: string;
};

type WorkspaceData = {
  wallet: OrganizerWalletSnapshotApiResponse['data'];
  issues: OrganizerWalletIssuesApiResponse['data'];
};

export function OrganizerPaymentsWorkspace({
  locale,
  organizationId,
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
      <section className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild data-testid="payments-primary-cta">
            <Link
              href={{
                pathname: '/dashboard/payments/payouts',
                query: { organizationId },
              }}
            >
              {ctaMode === 'request' ? t('actions.requestPayout') : t('actions.queuePayoutRequest')}
            </Link>
          </Button>

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
        </div>
      </section>

      <OrganizerWalletSummary asOf={data.wallet.asOf} buckets={data.wallet.buckets} locale={locale} />
      <OrganizerActionQueue
        actionNeeded={data.issues.actionNeeded}
        inProgress={data.issues.inProgress}
      />
    </div>
  );
}
