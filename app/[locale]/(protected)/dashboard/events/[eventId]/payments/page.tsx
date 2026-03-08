import { EventPaymentsHeader } from '@/components/payments/event-payments-header';
import { OrganizerPaymentsWorkspace } from '@/components/payments/organizer-payments-workspace';
import { getEventPayoutHistoryHref } from '@/lib/payments/organizer/hrefs';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { getEventEditionDetail } from '@/lib/events/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

type EventPaymentsPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata({ params }: EventPaymentsPageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/events/[eventId]/payments',
    (messages) => messages.Pages?.DashboardPayments?.metadata,
    { robots: { index: false, follow: false } },
  );
}

export default async function EventPaymentsPage({ params }: EventPaymentsPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/payments' });

  const tPayments = await getTranslations('pages.dashboardPayments');
  const tEvents = await getTranslations('pages.dashboardEvents.detail.nav');
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <EventPaymentsHeader
        eyebrow={tPayments('eventContext.eyebrow')}
        title={tEvents('payments')}
        description={tPayments('eventContext.homeDescription', {
          organization: event.organizationName,
        })}
        note={tPayments('eventContext.note')}
        organizationName={event.organizationName}
        organizationLabel={tPayments('eventContext.organizationLabel')}
        scopeLabel={tPayments('eventContext.scopeLabel')}
        actions={
          <Button asChild variant="outline">
            <Link href={getEventPayoutHistoryHref(eventId)}>
              {tPayments('eventContext.viewPayoutsAction')}
            </Link>
          </Button>
        }
      />

      <OrganizerPaymentsWorkspace
        locale={locale as 'es' | 'en'}
        organizationId={event.organizationId}
        organizationName={event.organizationName}
        historyHref={getEventPayoutHistoryHref(eventId)}
        eventId={eventId}
        showHistoryShortcut={false}
      />
    </div>
  );
}
