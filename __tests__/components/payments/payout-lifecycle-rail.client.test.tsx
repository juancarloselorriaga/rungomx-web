import { PayoutLifecycleRail } from '@/components/payments/payout-lifecycle-rail';
import { render, screen, within } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('PayoutLifecycleRail', () => {
  it('renders lifecycle events in order with reason and amount details', () => {
    render(
      <PayoutLifecycleRail
        locale="en"
        events={[
          {
            eventId: 'evt-requested',
            eventName: 'payout.requested',
            status: 'requested',
            occurredAt: new Date('2026-03-03T10:00:00.000Z'),
            reasonCode: null,
            amountMinor: 150_000,
          },
          {
            eventId: 'evt-paused',
            eventName: 'payout.paused',
            status: 'paused',
            occurredAt: new Date('2026-03-03T10:10:00.000Z'),
            reasonCode: 'risk_check_required',
            amountMinor: 120_000,
          },
        ]}
      />,
    );

    const timelineItems = screen.getAllByRole('listitem');
    expect(timelineItems).toHaveLength(2);
    expect(within(timelineItems[0]).getByText('payout.requested')).toBeInTheDocument();
    expect(within(timelineItems[0]).getByText('payouts.statuses.requested')).toBeInTheDocument();
    expect(within(timelineItems[1]).getByText('payout.paused')).toBeInTheDocument();
    expect(within(timelineItems[1]).getByText('payouts.statuses.paused')).toBeInTheDocument();
    expect(within(timelineItems[1]).getByText('detail.stateReason')).toBeInTheDocument();
    expect(within(timelineItems[1]).getByText('risk_check_required')).toBeInTheDocument();
    expect(within(timelineItems[1]).getByText('detail.amountSummary')).toBeInTheDocument();
    expect(within(timelineItems[1]).getByText(/1,200\.00/)).toBeInTheDocument();
  });

  it('shows empty-state copy when there are no lifecycle events', () => {
    render(<PayoutLifecycleRail locale="es" events={[]} />);

    expect(screen.getByRole('heading', { name: 'detail.stateTimeline' })).toBeInTheDocument();
    expect(screen.getByText('detail.noEvents')).toBeInTheDocument();
  });
});
