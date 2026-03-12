import { PayoutRequestForm } from '@/components/payments/payout-request-form';
import { organizerPaymentsTelemetryStorageKey } from '@/lib/payments/organizer/telemetry';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

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

function mockJsonResponse(body: unknown, options?: { ok?: boolean; status?: number }): Response {
  const ok = options?.ok ?? true;
  const status = options?.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('PayoutRequestForm', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    delete (window as typeof window & { __RUNGO_PAYMENTS_SMOKE_TELEMETRY__?: unknown })
      .__RUNGO_PAYMENTS_SMOKE_TELEMETRY__;
    window.sessionStorage.removeItem(organizerPaymentsTelemetryStorageKey);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('submits a payout request and renders outcome summary', async () => {
    const fetchMock = global.fetch as jest.Mock;

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        data: {
          payoutQuoteId: 'quote-1',
          payoutRequestId: 'request-1',
          payoutContractId: 'contract-1',
          maxWithdrawableAmountMinor: 100_000,
          requestedAmountMinor: 50_000,
        },
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

    await waitFor(() => {
      expect(screen.getByText('request.successTitle')).toBeInTheDocument();
    });

    expect(screen.getByText(/request.summary.requestId/)).toBeInTheDocument();
    expect(screen.getByText(/request.summary.quoteId/)).toBeInTheDocument();
    expect(screen.getByText(/request.summary.contractId/)).toBeInTheDocument();
    expect(window.__RUNGO_PAYMENTS_SMOKE_TELEMETRY__).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventName: 'organizer_payout_request_submitted',
          organizationId: 'org-1',
          payoutRequestId: 'request-1',
        }),
      ]),
    );
  });

  it('handles active conflict and submits queued payout intent fallback', async () => {
    const fetchMock = global.fetch as jest.Mock;

    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            code: 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED',
            suggestedAction: 'submit_queue_intent',
          },
          { ok: false, status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          data: {
            payoutQueuedIntentId: 'queued-1',
            requestedAmountMinor: 50_000,
            blockedReasonCode: 'active_payout_lifecycle_conflict',
          },
        }),
      );

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
    expect(window.__RUNGO_PAYMENTS_SMOKE_TELEMETRY__).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventName: 'organizer_payout_queue_intent_submitted',
          organizationId: 'org-1',
          payoutQueuedIntentId: 'queued-1',
        }),
      ]),
    );
  });

  it('guards against duplicate submit while the payout request is in flight', async () => {
    const fetchMock = global.fetch as jest.Mock;

    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                mockJsonResponse({
                  data: {
                    payoutQuoteId: 'quote-dup',
                    payoutRequestId: 'request-dup',
                    payoutContractId: 'contract-dup',
                    maxWithdrawableAmountMinor: 100_000,
                    requestedAmountMinor: 50_000,
                  },
                }),
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
