import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

import { BillingSettingsClient } from '@/components/settings/billing/billing-settings-client';
import type { SerializableBillingStatus } from '@/lib/billing/serialization';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    dateTime: () => 'Jan 1, 2026, 12:00 PM',
  }),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@/app/actions/billing', () => ({
  getBillingStatusAction: jest.fn(async () => ({ ok: false })),
  redeemPromoCodeAction: jest.fn(),
  resumeSubscriptionAction: jest.fn(),
  scheduleCancelAtPeriodEndAction: jest.fn(),
  startTrialAction: jest.fn(),
}));

function buildStatus(
  overrides: Partial<SerializableBillingStatus> = {},
): SerializableBillingStatus {
  return {
    isPro: false,
    proUntil: null,
    effectiveSource: null,
    sources: [],
    nextProStartsAt: null,
    subscription: null,
    trialEligible: true,
    ...overrides,
  };
}

describe('BillingSettingsClient', () => {
  it('renders the billing sections while preserving core status and action controls', () => {
    render(
      <BillingSettingsClient
        initialStatus={buildStatus()}
        emailVerified={true}
        isInternal={false}
      />,
    );

    expect(screen.getByText('status.title')).toBeInTheDocument();
    expect(screen.getByText('trial.title')).toBeInTheDocument();
    expect(screen.getByText('subscription.title')).toBeInTheDocument();
    expect(screen.getByText('promo.title')).toBeInTheDocument();
    expect(screen.getByTestId('billing-pro-badge')).toBeInTheDocument();
    expect(screen.getByTestId('billing-pro-until')).toBeInTheDocument();
    expect(screen.getByTestId('billing-effective-source')).toBeInTheDocument();
    expect(screen.getByTestId('billing-start-trial')).toBeInTheDocument();
    expect(screen.getByTestId('billing-promo-code')).toBeInTheDocument();
    expect(screen.getByTestId('billing-redeem-promo')).toBeInTheDocument();
  });

  it('keeps internal bypass users out of trial, subscription, and promo actions', () => {
    render(
      <BillingSettingsClient
        initialStatus={buildStatus({
          isPro: true,
          effectiveSource: 'internal_bypass',
          trialEligible: false,
        })}
        emailVerified={true}
        isInternal={true}
      />,
    );

    expect(screen.getByTestId('billing-pro-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('billing-start-trial')).not.toBeInTheDocument();
    expect(screen.queryByTestId('billing-promo-code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('billing-redeem-promo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('billing-cancel-subscription')).not.toBeInTheDocument();
    expect(screen.queryByTestId('billing-resume-subscription')).not.toBeInTheDocument();
  });
});
