import { Button } from '@/components/ui/button';
import { PayoutDetailViewTelemetry } from '@/components/payments/payout-detail-view-telemetry';
import { PayoutLifecycleRail } from '@/components/payments/payout-lifecycle-rail';
import { PayoutStatementAction } from '@/components/payments/payout-statement-action';
import { Link } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getOrgMembership } from '@/lib/organizations/permissions';
import { getOrganizerPayoutDetailByRequestId } from '@/lib/payments/organizer/payout-views';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type DashboardPaymentsPayoutDetailParams = {
  locale: string;
  payoutRequestId: string;
};

type DashboardPaymentsPayoutDetailPageProps = {
  params: Promise<DashboardPaymentsPayoutDetailParams>;
};

function formatMoney(minor: number, currency: string, locale: 'es' | 'en'): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

function formatDate(value: Date, locale: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<DashboardPaymentsPayoutDetailParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/payments/payouts',
    (messages) => messages.Pages?.DashboardPayments?.metadata,
    {
      robots: { index: false, follow: false },
    },
  );
}

export default async function DashboardPaymentsPayoutDetailPage({
  params,
}: DashboardPaymentsPayoutDetailPageProps) {
  const { locale, payoutRequestId } = await params;
  await configPageLocale(params, {
    pathname: '/dashboard/payments/payouts/[payoutRequestId]',
  });

  const localeKey = locale as 'es' | 'en';
  const t = await getTranslations('pages.dashboardPayments');
  const authContext = await getAuthContext();
  const detail = await getOrganizerPayoutDetailByRequestId(payoutRequestId);
  const isSupportUser = authContext.permissions.canViewStaffTools;
  const membership =
    detail && !isSupportUser && authContext.user
      ? await getOrgMembership(authContext.user.id, detail.organizerId)
      : null;

  if (!detail || (!isSupportUser && !membership)) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">{t('detail.title')}</h1>
          <p className="text-muted-foreground">{t('detail.description')}</p>
        </div>

        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold">{t('detail.notFoundTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('detail.notFoundDescription')}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/payments/payouts">{t('nav.backToPayouts')}</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/payments">{t('nav.backToPayments')}</Link>
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const organizationId = detail.organizerId;

  return (
    <div className="space-y-6">
      <PayoutDetailViewTelemetry
        organizationId={organizationId}
        payoutRequestId={detail.payoutRequestId}
      />

      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">{t('detail.title')}</h1>
        <p className="text-muted-foreground">{t('detail.description')}</p>
      </div>

      <section className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t('payouts.table.requestId')}</dt>
            <dd className="font-medium break-all">{detail.payoutRequestId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('payouts.table.status')}</dt>
            <dd className="font-medium">{t(`payouts.statuses.${detail.status}`)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('payouts.table.requested')}</dt>
            <dd className="font-medium">
              {formatMoney(detail.requestedAmountMinor, detail.currency, localeKey)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('payouts.table.currentAmount')}</dt>
            <dd className="font-medium">
              {formatMoney(detail.currentRequestedAmountMinor, detail.currency, localeKey)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('payouts.table.requestedAt')}</dt>
            <dd className="font-medium">{formatDate(detail.requestedAt, localeKey)}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link
              href={{
                pathname: '/dashboard/payments/payouts',
                query: { organizationId },
              }}
            >
              {t('nav.backToPayouts')}
            </Link>
          </Button>
          <Button asChild>
            <Link
              href={{
                pathname: '/dashboard/payments',
                query: { organizationId },
              }}
            >
              {t('nav.backToPayments')}
            </Link>
          </Button>
        </div>
      </section>

      <PayoutLifecycleRail locale={localeKey} events={detail.lifecycleEvents} />
      <PayoutStatementAction
        organizationId={organizationId}
        payoutRequestId={detail.payoutRequestId}
        isTerminal={detail.isTerminal}
      />
    </div>
  );
}
