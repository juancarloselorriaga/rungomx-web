import { Button } from '@/components/ui/button';
import { PayoutDetailScreen } from '@/components/payments/payout-detail-screen';
import { Link } from '@/i18n/navigation';
import { getEventEditionDetail } from '@/lib/events/queries';
import {
  getEventOverviewHref,
  getEventPaymentsHomeHref,
  getEventPayoutHistoryHref,
} from '@/lib/payments/organizer/hrefs';
import { shortIdentifier } from '@/lib/payments/organizer/presentation';
import { getOrganizerPayoutDetail } from '@/lib/payments/organizer/payout-views';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

type EventPaymentsPayoutDetailParams = {
  locale: string;
  eventId: string;
  payoutRequestId: string;
};

type EventPaymentsPayoutDetailPageProps = {
  params: Promise<EventPaymentsPayoutDetailParams>;
};

export async function generateMetadata({
  params,
}: EventPaymentsPayoutDetailPageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/events/[eventId]/payments/payouts/[payoutRequestId]',
    (messages) => messages.Pages?.DashboardPayments?.metadata,
    { robots: { index: false, follow: false } },
  );
}

export default async function EventPaymentsPayoutDetailPage({
  params,
}: EventPaymentsPayoutDetailPageProps) {
  const { locale, eventId, payoutRequestId } = await params;
  await configPageLocale(params, {
    pathname: '/dashboard/events/[eventId]/payments/payouts/[payoutRequestId]',
  });

  const localeKey = locale as 'es' | 'en';
  const tPayments = await getTranslations('pages.dashboardPayments');
  const tEvents = await getTranslations('pages.dashboardEvents.detail.nav');
  const pageTitle = tPayments('detail.pageTitle', { id: shortIdentifier(payoutRequestId) });
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    notFound();
  }

  const detail = await getOrganizerPayoutDetail({
    organizerId: event.organizationId,
    payoutRequestId,
  });

  if (!detail) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">{pageTitle}</h1>
          <p className="text-muted-foreground">{tPayments('eventContext.detailNotFoundDescription')}</p>
        </div>

        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold">{tPayments('detail.notFoundTitle')}</h2>
          <p className="text-sm text-muted-foreground">{tPayments('detail.notFoundDescription')}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={getEventPayoutHistoryHref(eventId)}>{tPayments('nav.backToPayouts')}</Link>
            </Button>
            <Button asChild>
              <Link href={getEventPaymentsHomeHref(eventId)}>{tEvents('payments')}</Link>
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <PayoutDetailScreen
      locale={localeKey}
      pageTitle={pageTitle}
      description={tPayments('eventContext.detailDescription', {
        organization: event.organizationName,
      })}
      organizationId={event.organizationId}
      organizationName={event.organizationName}
      detail={detail}
      breadcrumbs={[
        { label: tPayments('eventContext.backToEvent'), href: getEventOverviewHref(eventId) },
        { label: tEvents('payments'), href: getEventPaymentsHomeHref(eventId) },
        { label: tPayments('payouts.title'), href: getEventPayoutHistoryHref(eventId) },
      ]}
      labels={{
        status: tPayments(`payouts.statuses.${detail.status}`),
        summaryTitle: tPayments('detail.summaryTitle'),
        summaryDescription: tPayments('detail.summaryDescription'),
        requestedAmount: tPayments('detail.requestedAmountLabel'),
        currentAmount: tPayments('detail.currentAmountLabel'),
        maxWithdrawable: tPayments('detail.maxWithdrawableLabel'),
        requestedAt: tPayments('detail.requestedAtLabel'),
        technicalDetails: tPayments('detail.technicalDetailsLabel'),
        requestId: tPayments('payouts.table.requestId'),
        traceId: tPayments('detail.traceIdLabel'),
        includedAmount: tPayments('detail.includedAmountLabel'),
        deductionAmount: tPayments('detail.deductionAmountLabel'),
      }}
    />
  );
}
