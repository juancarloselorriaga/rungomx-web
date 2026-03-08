import { Button } from '@/components/ui/button';
import { PayoutDetailScreen } from '@/components/payments/payout-detail-screen';
import { Link } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getOrgMembership } from '@/lib/organizations/permissions';
import { getOrganizationSummary } from '@/lib/organizations/queries';
import {
  getGlobalPaymentsHomeHref,
  getGlobalPayoutHistoryHref,
} from '@/lib/payments/organizer/hrefs';
import { shortIdentifier } from '@/lib/payments/organizer/presentation';
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
  const pageTitle =
    localeKey === 'es'
      ? `Retiro #${shortIdentifier(payoutRequestId)}`
      : `Payout #${shortIdentifier(payoutRequestId)}`;
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
          <h1 className="text-3xl font-semibold">{pageTitle}</h1>
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
  const organization = await getOrganizationSummary(organizationId);

  return (
    <PayoutDetailScreen
      locale={localeKey}
      pageTitle={pageTitle}
      description={t('detail.description')}
      organizationId={organizationId}
      organizationName={organization?.name}
      detail={detail}
      breadcrumbs={[
        { label: t('nav.backToPayments'), href: getGlobalPaymentsHomeHref(organizationId) },
        { label: t('nav.backToPayouts'), href: getGlobalPayoutHistoryHref(organizationId) },
      ]}
      labels={{
        status: t(`payouts.statuses.${detail.status}`),
        summaryTitle: t('detail.summaryTitle'),
        summaryDescription: t('detail.summaryDescription'),
        requestedAmount: t('detail.requestedAmountLabel'),
        currentAmount: t('detail.currentAmountLabel'),
        maxWithdrawable: t('detail.maxWithdrawableLabel'),
        requestedAt: t('detail.requestedAtLabel'),
        technicalDetails: t('detail.technicalDetailsLabel'),
        requestId: t('payouts.table.requestId'),
        traceId: t('detail.traceIdLabel'),
        includedAmount: t('detail.includedAmountLabel'),
        deductionAmount: t('detail.deductionAmountLabel'),
      }}
    />
  );
}
