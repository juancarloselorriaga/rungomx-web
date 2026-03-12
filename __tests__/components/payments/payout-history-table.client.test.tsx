import { PayoutHistoryTable } from '@/components/payments/payout-history-table';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'payouts.table.requestLabel') {
      return `Request ${String(values?.id ?? '')}`;
    }

    return key;
  },
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
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('PayoutHistoryTable', () => {
  it('uses dense-table nowrap headers and preserves explicit paging disclosure', () => {
    render(
      <PayoutHistoryTable
        locale="en"
        items={[
          {
            organizerId: 'org-1',
            payoutRequestId: 'payout-request-1234567890',
            traceId: 'trace-payout-1',
            requestedAmountMinor: 125000,
            currentRequestedAmountMinor: 120000,
            maxWithdrawableAmountMinor: 120000,
            currency: 'MXN',
            status: 'requested',
            requestedAt: new Date('2026-03-10T10:00:00.000Z'),
          },
        ]}
        scopeSummary="Showing 1-1 of 8 payout requests"
        scopeHint="Newest requests first."
        pageStatus="Page 1 of 8"
        firstPageHref={null}
        previousPageHref={null}
        nextPageHref={'/dashboard/payments/payouts?page=2' as never}
        lastPageHref={'/dashboard/payments/payouts?page=8' as never}
        firstPageLabel="First"
        previousPageLabel="Previous"
        nextPageLabel="Next"
        lastPageLabel="Last"
      />,
    );

    expect(screen.getByText('Showing 1-1 of 8 payout requests')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 8')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'payouts.table.requestedAt' })).toHaveClass(
      'whitespace-nowrap',
    );
    expect(screen.getByRole('columnheader', { name: 'payouts.table.currentAmount' })).toHaveClass(
      'whitespace-nowrap',
    );
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/dashboard/payments/payouts?page=2',
    );
  });
});
