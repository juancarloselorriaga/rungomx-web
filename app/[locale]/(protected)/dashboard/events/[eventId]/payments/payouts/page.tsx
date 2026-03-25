import { EventPaymentsHeader } from '@/components/payments/event-payments-header';
import { PayoutHistoryTable } from '@/components/payments/payout-history-table';
import { PayoutRequestDialog } from '@/components/payments/payout-request-dialog';
import { Link } from '@/i18n/navigation';
import { getEventEditionDetail } from '@/lib/events/queries';
import { getEventPaymentsHomeHref } from '@/lib/payments/organizer/hrefs';
import {
  countOrganizerPayouts,
  listOrganizerPayouts,
} from '@/lib/payments/organizer/payout-views';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

type EventPaymentsPayoutsPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSingleSearchValue(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? '';
  return '';
}

function normalizePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

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
  searchParams,
}: EventPaymentsPayoutsPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/payments/payouts' });

  const tPayments = await getTranslations('pages.dashboardPayments');
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    notFound();
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedPage = normalizePositiveInt(
    readSingleSearchValue(resolvedSearchParams.page).trim(),
    1,
  );
  const payoutPageSize = 25;
  const payoutTotal = await countOrganizerPayouts({
    organizerId: event.organizationId,
  });
  const payoutPageCount = payoutTotal === 0 ? 0 : Math.ceil(payoutTotal / payoutPageSize);
  const payoutPage = payoutPageCount === 0 ? 1 : Math.min(requestedPage, payoutPageCount);
  const payoutOffset = (payoutPage - 1) * payoutPageSize;
  const payouts = await listOrganizerPayouts({
    organizerId: event.organizationId,
    limit: payoutPageSize,
    offset: payoutOffset,
  });
  const payoutStart = payoutTotal === 0 ? 0 : payoutOffset + 1;
  const payoutEnd = payoutTotal === 0 ? 0 : Math.min(payoutTotal, payoutOffset + payouts.length);

  function buildPayoutHistoryHref(page: number): {
    pathname: '/dashboard/events/[eventId]/payments/payouts';
    params: { eventId: string };
    query: Record<string, string>;
  } {
    return {
      pathname: '/dashboard/events/[eventId]/payments/payouts',
      params: { eventId },
      query: {
        page: String(page),
      },
    };
  }

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
        scopeSummary={tPayments('payouts.scopeSummary', {
          start: payoutStart,
          end: payoutEnd,
          total: payoutTotal,
        })}
        scopeHint={tPayments('payouts.scopeHint', {
          pageSize: payoutPageSize,
        })}
        pageStatus={tPayments('payouts.pageStatus', {
          page: payoutPageCount === 0 ? 0 : payoutPage,
          pageCount: payoutPageCount,
        })}
        firstPageHref={payoutPage > 1 ? buildPayoutHistoryHref(1) : null}
        previousPageHref={payoutPage > 1 ? buildPayoutHistoryHref(payoutPage - 1) : null}
        nextPageHref={
          payoutPage < payoutPageCount ? buildPayoutHistoryHref(payoutPage + 1) : null
        }
        lastPageHref={
          payoutPageCount > 0 && payoutPage < payoutPageCount
            ? buildPayoutHistoryHref(payoutPageCount)
            : null
        }
        firstPageLabel={tPayments('payouts.firstPageLabel')}
        previousPageLabel={tPayments('payouts.previousPageLabel')}
        nextPageLabel={tPayments('payouts.nextPageLabel')}
        lastPageLabel={tPayments('payouts.lastPageLabel')}
      />
    </div>
  );
}
