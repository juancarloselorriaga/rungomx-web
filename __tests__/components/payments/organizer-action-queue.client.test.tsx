import { OrganizerActionQueue } from '@/components/payments/organizer-action-queue';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string | { pathname?: string };
    children: ReactNode;
  }) => {
    const resolvedHref = typeof href === 'string' ? href : (href.pathname ?? '#');
    return (
      <a href={resolvedHref} {...props}>
        {children}
      </a>
    );
  },
}));

describe('OrganizerActionQueue', () => {
  it('uses safe fallback copy for unknown organizer events', () => {
    render(
      <OrganizerActionQueue
        locale="en"
        eventId="evt-1"
        actionNeeded={[
          {
            eventId: 'issue-1',
            traceId: 'trace-1',
            eventName: 'subscription.renewal_failed.pending_review',
            entityType: 'payout',
            entityId: 'payout-1',
            occurredAt: '2026-03-03T11:55:00.000Z',
            state: 'action_needed',
            recoveryGuidance: null,
          },
        ]}
        inProgress={[]}
      />,
    );

    const section = screen.getByTestId('payments-action-needed-section');
    expect(within(section).getByText('wallet.queue.genericTitle')).toBeInTheDocument();
    expect(within(section).getByText('wallet.queue.genericDescription')).toBeInTheDocument();
    expect(
      within(section).queryByText('Subscription Renewal Failed Pending Review'),
    ).not.toBeInTheDocument();
  });
});
