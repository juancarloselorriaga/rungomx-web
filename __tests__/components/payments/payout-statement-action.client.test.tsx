import { PayoutStatementAction } from '@/components/payments/payout-statement-action';
import { organizerPaymentsTelemetryStorageKey } from '@/lib/payments/organizer/telemetry';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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

describe('PayoutStatementAction', () => {
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

  it('shows not-terminal messaging when payout is not terminal', () => {
    render(
      <PayoutStatementAction
        locale="en"
        organizationId="org-1"
        payoutRequestId="request-1"
        isTerminal={false}
      />,
    );

    expect(screen.getByText('detail.statement.notTerminal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'actions.viewStatement' })).not.toBeInTheDocument();
  });

  it('loads statement details for terminal payouts', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        data: {
          payoutStatus: 'completed',
          statementFingerprint: 'fp-statement-1',
          originalRequestedAmountMinor: 110000,
          currentRequestedAmountMinor: 108500,
          terminalAmountMinor: 108500,
          adjustmentTotalMinor: 1500,
          generatedAt: new Date('2026-03-03T22:09:00.000Z').toISOString(),
        },
      }),
    );

    render(
      <PayoutStatementAction
        locale="en"
        organizationId="org-1"
        payoutRequestId="request-1"
        isTerminal
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'actions.viewStatement' }));

    await waitFor(() => {
      expect(screen.getByText('detail.statement.ready')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/payments/payouts/request-1/statement?organizationId=org-1',
      { cache: 'no-store' },
    );
    expect(screen.getByText('detail.statement.summaryTitle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'detail.statement.copyAction' })).toBeInTheDocument();
    expect(screen.getByText('fp-statement-1')).toBeInTheDocument();
    expect(window.__RUNGO_PAYMENTS_SMOKE_TELEMETRY__).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventName: 'organizer_payout_statement_requested',
          organizationId: 'org-1',
          payoutRequestId: 'request-1',
          isTerminal: true,
        }),
      ]),
    );
  });

  it('handles 404 and 409 statement responses with explicit messaging', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({}, { ok: false, status: 404 }))
      .mockResolvedValueOnce(mockJsonResponse({}, { ok: false, status: 409 }));

    const { rerender } = render(
      <PayoutStatementAction
        locale="en"
        organizationId="org-1"
        payoutRequestId="request-1"
        isTerminal
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'actions.viewStatement' }));
    await waitFor(() => {
      expect(screen.getByText('detail.statement.notFound')).toBeInTheDocument();
    });

    rerender(
      <PayoutStatementAction
        locale="en"
        organizationId="org-1"
        payoutRequestId="request-2"
        isTerminal
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'actions.viewStatement' }));
    await waitFor(() => {
      expect(screen.getByText('detail.statement.notTerminal')).toBeInTheDocument();
    });
  });
});
