import { OrganizerWalletSummary } from '@/components/payments/organizer-wallet-summary';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { render, screen } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

describe('OrganizerWalletSummary', () => {
  it('surfaces max withdrawable as a derived tile alongside the wallet buckets', () => {
    render(
      <OrganizerWalletSummary
        asOf="2026-03-09T12:00:00.000Z"
        locale="en"
        buckets={{ availableMinor: 5000, processingMinor: 0, frozenMinor: 0, debtMinor: 2000 }}
      />,
    );

    expect(screen.getByText('wallet.buckets.available')).toBeInTheDocument();
    expect(screen.getByText('wallet.buckets.maxWithdrawableLabel')).toBeInTheDocument();
    expect(screen.getByText(formatMoneyFromMinor(3000, 'MXN', 'en'))).toBeInTheDocument();
  });
});
