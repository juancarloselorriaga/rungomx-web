import DashboardPaymentsLoading from '@/app/[locale]/(protected)/dashboard/payments/loading';
import DashboardPaymentDetailLoading from '@/app/[locale]/(protected)/dashboard/payments/payouts/[payoutRequestId]/loading';
import EventPaymentsLoading from '@/app/[locale]/(protected)/dashboard/events/[eventId]/payments/loading';
import EventPaymentsPayoutDetailLoading from '@/app/[locale]/(protected)/dashboard/events/[eventId]/payments/payouts/[payoutRequestId]/loading';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async (namespace?: string) => (key: string) => {
    if (namespace === 'pages.dashboardPayments') {
      if (key === 'home.shell.loadingAriaLabel') {
        return 'Loading payments';
      }
      if (key === 'detail.loadingAriaLabel') {
        return 'Loading payout detail';
      }
    }

    return key;
  }),
}));

describe('dashboard payments loading states', () => {
  it('localizes workspace loading aria labels', async () => {
    const homeHtml = renderToStaticMarkup(await DashboardPaymentsLoading());
    const eventHtml = renderToStaticMarkup(await EventPaymentsLoading());

    expect(homeHtml).toContain('aria-label="Loading payments"');
    expect(eventHtml).toContain('aria-label="Loading payments"');
  });

  it('localizes payout detail loading aria labels', async () => {
    const homeHtml = renderToStaticMarkup(await DashboardPaymentDetailLoading());
    const eventHtml = renderToStaticMarkup(await EventPaymentsPayoutDetailLoading());

    expect(homeHtml).toContain('aria-label="Loading payout detail"');
    expect(eventHtml).toContain('aria-label="Loading payout detail"');
  });
});
