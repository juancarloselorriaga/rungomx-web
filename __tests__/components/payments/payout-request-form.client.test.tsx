import { PayoutRequestForm } from '@/components/payments/payout-request-form';
import { organizerPaymentsTelemetryStorageKey } from '@/lib/payments/organizer/telemetry';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  queueOrganizerPayoutIntentAction,
  requestOrganizerPayoutAction,
} from '@/app/actions/payments-organizer-payouts';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
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

jest.mock('@/app/actions/payments-organizer-payouts', () => ({
  requestOrganizerPayoutAction: jest.fn(),
  queueOrganizerPayoutIntentAction: jest.fn(),
}));

describe('PayoutRequestForm', () => {
  const mockRequestOrganizerPayoutAction = requestOrganizerPayoutAction as jest.MockedFunction<
    typeof requestOrganizerPayoutAction
  >;
  const mockQueueOrganizerPayoutIntentAction =
    queueOrganizerPayoutIntentAction as jest.MockedFunction<typeof queueOrganizerPayoutIntentAction>;

  beforeEach(() => {
    mockRequestOrganizerPayoutAction.mockReset();
    mockQueueOrganizerPayoutIntentAction.mockReset();
    delete (window as typeof window & { __RUNGO_PAYMENTS_SMOKE_TELEMETRY__?: unknown })
      .__RUNGO_PAYMENTS_SMOKE_TELEMETRY__;
    window.sessionStorage.removeItem(organizerPaymentsTelemetryStorageKey);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('submits a payout request and renders outcome summary', async () => {
    mockRequestOrganizerPayoutAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                {
                  ok: true,
                  data: {
                    payoutQuoteId: 'quote-1',
                    payoutRequestId: 'request-1',
                    payoutContractId: 'contract-1',
                    maxWithdrawableAmountMinor: 100_000,
                    requestedAmountMinor: 50_000,
                  },
                } as never,
              ),
            10,
          );
        }),
    );

    render(<PayoutRequestForm organizationId="org-1" />);

    expect(screen.getByPlaceholderText('request.amountPlaceholder')).toBeInTheDocument();
    expect(screen.getByText('request.submitHint')).toBeInTheDocument();
    expect(screen.getByText('request.queuedHint')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('request.amountLabel'), {
      target: { value: '50000' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'actions.requestPayout' }));

    expect(
      screen.getByRole('button', { name: 'request.submittingAction' }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('request.successTitle')).toBeInTheDocument();
    });

    expect(screen.getByText(/request.summary.requestId/)).toBeInTheDocument();
    expect(screen.queryByText(/request.summary.quoteId/)).not.toBeInTheDocument();
    expect(screen.queryByText(/request.summary.contractId/)).not.toBeInTheDocument();
    expect(window.__RUNGO_PAYMENTS_SMOKE_TELEMETRY__).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventName: 'organizer_payout_request_submitted',
          organizationId: 'org-1',
          payoutRequestId: 'request-1',
        }),
      ]),
    );
    expect(mockRequestOrganizerPayoutAction).toHaveBeenCalledWith({
      organizationId: 'org-1',
      requestedAmountMinor: '50000',
    });
  });

  it('handles active conflict and submits queued payout intent fallback', async () => {
    mockRequestOrganizerPayoutAction.mockResolvedValueOnce({
      ok: false,
      error: 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED',
      message: 'active conflict',
    } as never);
    mockQueueOrganizerPayoutIntentAction.mockResolvedValueOnce({
      ok: true,
      data: {
        payoutQueuedIntentId: 'queued-1',
        requestedAmountMinor: 50_000,
        blockedReasonCode: 'active_payout_lifecycle_conflict',
      },
    } as never);

    render(<PayoutRequestForm organizationId="org-1" />);

    fireEvent.change(screen.getByLabelText('request.amountLabel'), {
      target: { value: '50000' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'actions.requestPayout' }));

    await waitFor(() => {
      expect(screen.getByText('request.conflictDescription')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'actions.queuePayoutRequest' }));

    await waitFor(() => {
      expect(screen.getByText('request.queueSuccessTitle')).toBeInTheDocument();
    });

    expect(screen.getByText(/request.summary.queueIntentId/)).toBeInTheDocument();
    expect(screen.getByText('request.summary.blockedReasonHuman')).toBeInTheDocument();
    expect(screen.queryByText(/^request\.summary\.blockedReason$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^request\.summary\.rawBlockedReason$/)).not.toBeInTheDocument();
    expect(window.__RUNGO_PAYMENTS_SMOKE_TELEMETRY__).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventName: 'organizer_payout_queue_intent_submitted',
          organizationId: 'org-1',
          payoutQueuedIntentId: 'queued-1',
        }),
      ]),
    );
    expect(mockQueueOrganizerPayoutIntentAction).toHaveBeenCalledWith({
      organizationId: 'org-1',
      requestedAmountMinor: 50000,
    });
  });

  it('guards against duplicate submit while the payout request is in flight', async () => {
    mockRequestOrganizerPayoutAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                {
                  ok: true,
                  data: {
                    payoutQuoteId: 'quote-dup',
                    payoutRequestId: 'request-dup',
                    payoutContractId: 'contract-dup',
                    maxWithdrawableAmountMinor: 100_000,
                    requestedAmountMinor: 50_000,
                  },
                } as never,
              ),
            25,
          );
        }),
    );

    render(<PayoutRequestForm organizationId="org-1" />);

    fireEvent.change(screen.getByLabelText('request.amountLabel'), {
      target: { value: '50000' },
    });

    const submitButton = screen.getByRole('button', { name: 'actions.requestPayout' });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('request.successTitle')).toBeInTheDocument();
    });

    expect(mockRequestOrganizerPayoutAction).toHaveBeenCalledTimes(1);
  });

  it('shows a safe localized fallback when the API returns an unknown code', async () => {
    mockRequestOrganizerPayoutAction.mockResolvedValueOnce({
      ok: false,
      error: 'PAYOUT_UNKNOWN_CONDITION',
    } as never);

    render(<PayoutRequestForm organizationId="org-1" />);

    fireEvent.change(screen.getByLabelText('request.amountLabel'), {
      target: { value: '50000' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'actions.requestPayout' }));

    await waitFor(() => {
      expect(screen.getByText('request.errors.unknownAction')).toBeInTheDocument();
    });
  });
});
