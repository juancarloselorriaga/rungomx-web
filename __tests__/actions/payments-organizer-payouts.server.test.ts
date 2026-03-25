export {};

type MockAuthContext = {
  user: { id: string };
  permissions: { canManageEvents: boolean };
};

const defaultAuthContext: MockAuthContext = {
  user: { id: 'organizer-user-1' },
  permissions: { canManageEvents: false },
};

const mockWithAuthenticatedUser = jest.fn();
const mockFindOrganization = jest.fn();
const mockGetOrgMembership = jest.fn();
const mockCreatePayoutQuoteAndContract = jest.fn();
const mockCreateQueuedPayoutIntent = jest.fn();

jest.mock('@/lib/auth/action-wrapper', () => ({
  withAuthenticatedUser: (options: { unauthenticated: () => unknown }) =>
    (handler: (ctx: MockAuthContext, ...args: unknown[]) => Promise<unknown>) =>
      async (...args: unknown[]) => {
        const next = mockWithAuthenticatedUser();
        if (next?.unauthenticated) return options.unauthenticated();
        return handler(next?.context ?? defaultAuthContext, ...args);
      },
}));

jest.mock('@/db', () => ({
  db: {
    query: {
      organizations: {
        findFirst: (...args: unknown[]) => mockFindOrganization(...args),
      },
    },
  },
}));

jest.mock('@/lib/organizations/permissions', () => ({
  getOrgMembership: (...args: unknown[]) => mockGetOrgMembership(...args),
  requireOrgPermission: (membership: { role?: string } | null) => {
    if (!membership || membership.role === 'viewer') {
      throw new Error('Permission denied');
    }
  },
}));

jest.mock('@/lib/payments/payouts/quote-contract', () => ({
  PayoutQuoteContractError: class PayoutQuoteContractError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  createPayoutQuoteAndContract: (...args: unknown[]) => mockCreatePayoutQuoteAndContract(...args),
}));

jest.mock('@/lib/payments/payouts/queue-intents', () => ({
  PayoutQueueIntentError: class PayoutQueueIntentError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  createQueuedPayoutIntent: (...args: unknown[]) => mockCreateQueuedPayoutIntent(...args),
}));

const {
  requestOrganizerPayoutAction,
  queueOrganizerPayoutIntentAction,
} = require('@/app/actions/payments-organizer-payouts') as typeof import('@/app/actions/payments-organizer-payouts');

describe('payments organizer payout actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithAuthenticatedUser.mockReturnValue(null);
    mockFindOrganization.mockResolvedValue({ id: 'org-1' });
    mockGetOrgMembership.mockResolvedValue({ role: 'owner' });
  });

  it('submits payout request via server action and returns FormActionResult success', async () => {
    mockCreatePayoutQuoteAndContract.mockResolvedValue({
      payoutQuoteId: 'quote-1',
      payoutRequestId: 'request-1',
      payoutContractId: 'contract-1',
      maxWithdrawableAmountMinor: 100_000,
      requestedAmountMinor: 50_000,
    });

    const result = await requestOrganizerPayoutAction({
      organizationId: 'd7a2f0dc-0168-4d90-a08e-63b4a90d14f3',
      requestedAmountMinor: 50_000,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        payoutQuoteId: 'quote-1',
        payoutRequestId: 'request-1',
        payoutContractId: 'contract-1',
        maxWithdrawableAmountMinor: 100_000,
        requestedAmountMinor: 50_000,
      },
    });
  });

  it.each([' 50000 ', '12.5', '1e2', '+100', '100usd', '   '])(
    'rejects malformed payout request amount string %p server-side',
    async (requestedAmountMinor) => {
      const result = await requestOrganizerPayoutAction({
        organizationId: 'd7a2f0dc-0168-4d90-a08e-63b4a90d14f3',
        requestedAmountMinor,
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          error: 'INVALID_INPUT',
          fieldErrors: expect.objectContaining({
            requestedAmountMinor: expect.any(Array),
          }),
        }),
      );
      expect(mockCreatePayoutQuoteAndContract).not.toHaveBeenCalled();
    },
  );

  it('accepts canonical payout request amount strings', async () => {
    mockCreatePayoutQuoteAndContract.mockResolvedValue({
      payoutQuoteId: 'quote-2',
      payoutRequestId: 'request-2',
      payoutContractId: 'contract-2',
      maxWithdrawableAmountMinor: 100_000,
      requestedAmountMinor: 50_000,
    });

    const result = await requestOrganizerPayoutAction({
      organizationId: 'd7a2f0dc-0168-4d90-a08e-63b4a90d14f3',
      requestedAmountMinor: '50000',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        payoutQuoteId: 'quote-2',
        payoutRequestId: 'request-2',
        payoutContractId: 'contract-2',
        maxWithdrawableAmountMinor: 100_000,
        requestedAmountMinor: 50_000,
      },
    });
    expect(mockCreatePayoutQuoteAndContract).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedAmountMinor: 50_000,
      }),
    );
  });

  it('returns active-conflict error code for queue fallback UI path', async () => {
    const { PayoutQuoteContractError } = require('@/lib/payments/payouts/quote-contract') as {
      PayoutQuoteContractError: new (code: string, message: string) => Error;
    };

    mockCreatePayoutQuoteAndContract.mockRejectedValue(
      new PayoutQuoteContractError(
        'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED',
        'active payout lifecycle',
      ),
    );

    const result = await requestOrganizerPayoutAction({
      organizationId: 'd7a2f0dc-0168-4d90-a08e-63b4a90d14f3',
      requestedAmountMinor: 50_000,
    });

    expect(result).toEqual({
      ok: false,
      error: 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED',
      message: 'active payout lifecycle',
    });
  });

  it('submits queued payout intent via server action', async () => {
    mockCreateQueuedPayoutIntent.mockResolvedValue({
      payoutQueuedIntentId: 'queued-1',
      requestedAmountMinor: 50_000,
      blockedReasonCode: 'active_payout_lifecycle_conflict',
    });

    const formData = new FormData();
    formData.set('organizationId', 'd7a2f0dc-0168-4d90-a08e-63b4a90d14f3');
    formData.set('requestedAmountMinor', '50000');

    const result = await queueOrganizerPayoutIntentAction(formData);

    expect(result).toEqual({
      ok: true,
      data: {
        payoutQueuedIntentId: 'queued-1',
        requestedAmountMinor: 50_000,
        blockedReasonCode: 'active_payout_lifecycle_conflict',
      },
    });
  });

  it.each([' 50000 ', '12.5', '1e2', '-50', '50000usd', '   '])(
    'rejects malformed queued payout amount string %p server-side',
    async (requestedAmountMinor) => {
      const formData = new FormData();
      formData.set('organizationId', 'd7a2f0dc-0168-4d90-a08e-63b4a90d14f3');
      formData.set('requestedAmountMinor', requestedAmountMinor);

      const result = await queueOrganizerPayoutIntentAction(formData);

      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          error: 'INVALID_INPUT',
          fieldErrors: expect.objectContaining({
            requestedAmountMinor: expect.any(Array),
          }),
        }),
      );
      expect(mockCreateQueuedPayoutIntent).not.toHaveBeenCalled();
    },
  );
});
