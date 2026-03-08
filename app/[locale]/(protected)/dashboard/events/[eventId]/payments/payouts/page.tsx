import { EventPaymentsHeader } from '@/components/payments/event-payments-header';
import { PayoutHistoryTable } from '@/components/payments/payout-history-table';
import { PayoutRequestDialog } from '@/components/payments/payout-request-dialog';
import { Link } from '@/i18n/navigation';
import { getEventEditionDetail } from '@/lib/events/queries';
import {
  getEventPaymentsHomeHref,
} from '@/lib/payments/organizer/hrefs';
import { listOrganizerPayouts } from '@/lib/payments/organizer/payout-views';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

type EventPaymentsPayoutsPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata({
  params,
}: EventPaymentsPayoutsPageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/events/[eventId]/payments/payouts',
    (messages) => messages.Pages?.DashboardPayments?.metadata,
    { robots: { index: false, follow: false } },
  );
}

export default async function EventPaymentsPayoutsPage({
  params,
}: EventPaymentsPayoutsPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/payments/payouts' });

  const tPayments = await getTranslations('pages.dashboardPayments');
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    notFound();
  }

  const payouts = await listOrganizerPayouts({
    organizerId: event.organizationId,
  });

  return (
    <div className="space-y-6">
      <EventPaymentsHeader
        eyebrow={tPayments('eventContext.eyebrow')}
        title={tPayments('payouts.title')}
        description={tPayments('eventContext.payoutsDescription', {
          organization: event.organizationName,
        })}
        note={tPayments('eventContext.note')}
        organizationName={event.organizationName}
        organizationLabel={tPayments('eventContext.organizationLabel')}
        scopeLabel={tPayments('eventContext.scopeLabel')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={getEventPaymentsHomeHref(eventId)}
              className="inline-flex text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              {tPayments('eventContext.backToOverview')}
            </Link>
            <PayoutRequestDialog
              organizationId={event.organizationId}
              triggerLabel={tPayments('actions.requestPayout')}
              eventId={eventId}
            />
          </div>
        }
      />

      <PayoutHistoryTable
        items={payouts}
        locale={locale as 'es' | 'en'}
        title={tPayments('eventContext.payoutsHistoryTitle')}
        description={tPayments('eventContext.payoutsHistoryDescription', {
          organization: event.organizationName,
        })}
        eventId={eventId}
      />
    </div>
  );
}
