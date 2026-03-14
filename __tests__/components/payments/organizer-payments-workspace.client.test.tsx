import { OrganizerPaymentsWorkspace } from '@/components/payments/organizer-payments-workspace';
import { organizerPaymentsTelemetryStorageKey } from '@/lib/payments/organizer/telemetry';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'wallet.asOf' && values?.timestamp) {
      return `As of ${String(values.timestamp)}`;
    }

    if (key === 'wallet.queue.actionNeededDescription') {
      return 'Items that need action to keep this organization payout-ready.';
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
}));

const walletResponse = {
  data: {
    organizerId: 'org-1',
    asOf: '2026-03-03T12:00:00.000Z',
    buckets: {
      availableMinor: 120_000,
      processingMinor: 0,
      frozenMinor: 3_000,
      debtMinor: 500,
    },
    debt: {
      waterfallOrder: [],
      categoryBalancesMinor: {},
      repaymentAppliedMinor: 0,
    },
  },
};

const walletResponseWithProcessing = {
  ...walletResponse,
  data: {
    ...walletResponse.data,
    buckets: {
      ...walletResponse.data.buckets,
      availableMinor: 0,
      processingMinor: 5_000,
    },
  },
};

const issuesResponse = {
  data: {
    organizerId: 'org-1',
    asOf: '2026-03-03T12:00:00.000Z',
    actionNeeded: [
      {
        eventId: 'evt-action',
        traceId: 'trace-action',
        eventName: 'payout.paused',
        entityType: 'payout',
        entityId: 'payout-1',
        occurredAt: '2026-03-03T11:55:00.000Z',
        state: 'action_needed' as const,
        recoveryGuidance: null,
      },
    ],
    inProgress: [
      {
        eventId: 'evt-progress',
        traceId: 'trace-progress',
        eventName: 'payout.processing',
        entityType: 'payout',
        entityId: 'payout-2',
        occurredAt: '2026-03-03T11:40:00.000Z',
        state: 'in_progress' as const,
        recoveryGuidance: null,
      },
    ],
  },
};

const requestEligibleIssuesResponse = {
  data: {
    organizerId: 'org-1',
    asOf: '2026-03-03T12:00:00.000Z',
    actionNeeded: [],
    inProgress: [],
  },
};

function mockJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe('OrganizerPaymentsWorkspace', () => {
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

  it('renders wallet summaries, queue segmentation, and request payout CTA when eligible', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse(walletResponse))
      .mockResolvedValueOnce(mockJsonResponse(requestEligibleIssuesResponse));

    render(<OrganizerPaymentsWorkspace locale="en" organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('wallet.buckets.available')).toBeInTheDocument();
    });

    expect(screen.getByText('wallet.queue.emptyTitle')).toBeInTheDocument();
    expect(screen.getByText(/1,200\.00/)).toBeInTheDocument();
    expect(screen.getByTestId('payments-primary-cta')).toHaveTextContent('actions.requestPayout');
    expect(window.__RUNGO_PAYMENTS_SMOKE_TELEMETRY__).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventName: 'organizer_payments_workspace_viewed',
          organizationId: 'org-1',
        }),
      ]),
    );
  });

  it('switches CTA to queue payout request when processing funds are active', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse(walletResponseWithProcessing))
      .mockResolvedValueOnce(mockJsonResponse(issuesResponse));

    render(<OrganizerPaymentsWorkspace locale="en" organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('payments-primary-cta')).toBeInTheDocument();
    });

    expect(screen.getByTestId('payments-primary-cta')).toHaveTextContent(
      'actions.queuePayoutRequest',
    );
    expect(
      screen.getByText('Items that need action to keep this organization payout-ready.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('trace-action')).not.toBeInTheDocument();
    expect(screen.queryByText('trace-progress')).not.toBeInTheDocument();
  });

  it('renders degraded state and supports retry when API calls fail', async () => {
    const fetchMock = global.fetch as jest.Mock;

    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({ error: 'failed' }, false))
      .mockResolvedValueOnce(mockJsonResponse({ error: 'failed' }, false))
      .mockResolvedValueOnce(mockJsonResponse(walletResponse))
      .mockResolvedValueOnce(mockJsonResponse(issuesResponse));

    render(<OrganizerPaymentsWorkspace locale="en" organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('home.shell.degradedTitle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }));

    await waitFor(() => {
      expect(screen.getByTestId('payments-primary-cta')).toBeInTheDocument();
    });
  });

  it('preserves wallet context when follow-up activity fails to load', async () => {
    const fetchMock = global.fetch as jest.Mock;

    fetchMock
      .mockResolvedValueOnce(mockJsonResponse(walletResponse))
      .mockResolvedValueOnce(mockJsonResponse({ error: 'failed' }, false));

    render(<OrganizerPaymentsWorkspace locale="en" organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('home.shell.partialTitle').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('home.shell.partialQueueDescription').length).toBeGreaterThan(0);
    expect(screen.getByText('wallet.buckets.available')).toBeInTheDocument();
    expect(screen.getByTestId('payments-primary-cta')).toHaveTextContent('actions.requestPayout');
    expect(screen.getByRole('heading', { name: 'wallet.queue.title' })).toBeInTheDocument();
  });
});
