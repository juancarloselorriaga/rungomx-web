type MockAuthContext = {
  user: { id: string };
};

const defaultAuthContext: MockAuthContext = {
  user: { id: 'staff-user-1' },
};

const mockWithStaffUser = jest.fn();
const mockHeaders = jest.fn();
const mockGetRequestContext = jest.fn();
const mockUpsertDailyFxRateForAdmin = jest.fn();
const mockListDailyFxRatesForAdmin = jest.fn();
const mockGetFxRateActionFlagsForAdmin = jest.fn();

jest.mock('@/lib/auth/action-wrapper', () => ({
  withStaffUser: (options: { unauthenticated: () => unknown; forbidden: () => unknown }) =>
    (handler: (ctx: MockAuthContext, ...args: unknown[]) => Promise<unknown>) =>
      async (...args: unknown[]) => {
        const mockResult = mockWithStaffUser();
        if (mockResult?.unauthenticated) return options.unauthenticated();
        if (mockResult?.forbidden) return options.forbidden();
        return handler(mockResult?.context ?? defaultAuthContext, ...args);
      },
}));

jest.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

jest.mock('@/lib/audit', () => ({
  getRequestContext: (...args: unknown[]) => mockGetRequestContext(...args),
}));

jest.mock('@/lib/payments/economics/fx-rate-management', () => ({
  upsertDailyFxRateForAdmin: (...args: unknown[]) => mockUpsertDailyFxRateForAdmin(...args),
  listDailyFxRatesForAdmin: (...args: unknown[]) => mockListDailyFxRatesForAdmin(...args),
  getFxRateActionFlagsForAdmin: (...args: unknown[]) => mockGetFxRateActionFlagsForAdmin(...args),
}));

const {
  upsertDailyFxRateAdminAction,
  listDailyFxRatesAdminAction,
  getFxRateActionFlagsAdminAction,
} = require('@/app/actions/admin-payments-fx') as typeof import('@/app/actions/admin-payments-fx');

describe('admin payments FX actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithStaffUser.mockReturnValue(null);
    mockHeaders.mockResolvedValue(new Headers());
    mockGetRequestContext.mockResolvedValue({
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      requestId: 'req-1',
    });
  });

  it('returns UNAUTHENTICATED when staff auth wrapper blocks upsert action', async () => {
    mockWithStaffUser.mockReturnValue({ unauthenticated: true });

    const result = await upsertDailyFxRateAdminAction({
      sourceCurrency: 'USD',
      effectiveDate: '2026-02-20',
      rateToMxn: 19.45,
      reason: 'manual-fx-fix',
    });

    expect(result).toEqual({
      ok: false,
      error: 'UNAUTHENTICATED',
      message: 'UNAUTHENTICATED',
    });
    expect(mockUpsertDailyFxRateForAdmin).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when staff auth wrapper blocks list action', async () => {
    mockWithStaffUser.mockReturnValue({ forbidden: true });

    const result = await listDailyFxRatesAdminAction();

    expect(result).toEqual({
      ok: false,
      error: 'FORBIDDEN',
      message: 'FORBIDDEN',
    });
    expect(mockListDailyFxRatesForAdmin).not.toHaveBeenCalled();
  });

  it('returns INVALID_INPUT for malformed upsert payload', async () => {
    const result = await upsertDailyFxRateAdminAction({
      sourceCurrency: 'US',
      effectiveDate: '20-02-2026',
      rateToMxn: -1,
      reason: 'x',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: 'INVALID_INPUT',
        fieldErrors: expect.any(Object),
      }),
    );
    expect(mockUpsertDailyFxRateForAdmin).not.toHaveBeenCalled();
  });

  it('upserts a daily FX rate from FormData and returns created rate id', async () => {
    mockUpsertDailyFxRateForAdmin.mockResolvedValue({ id: 'fx-rate-1' });

    const formData = new FormData();
    formData.set('sourceCurrency', 'USD');
    formData.set('effectiveDate', '2026-02-20');
    formData.set('rateToMxn', '19.45');
    formData.set('reason', 'manual-rate-adjustment');

    const result = await upsertDailyFxRateAdminAction(formData);

    expect(result).toEqual({ ok: true, data: { rateId: 'fx-rate-1' } });
    expect(mockGetRequestContext).toHaveBeenCalledWith(expect.any(Headers));

    const callInput = mockUpsertDailyFxRateForAdmin.mock.calls[0][0];
    expect(callInput).toEqual(
      expect.objectContaining({
        sourceCurrency: 'USD',
        rateToMxn: 19.45,
        reason: 'manual-rate-adjustment',
        actorUserId: 'staff-user-1',
      }),
    );
    expect(callInput.effectiveDate.toISOString()).toBe('2026-02-20T00:00:00.000Z');
  });

  it('returns SERVER_ERROR when FX upsert throws', async () => {
    mockUpsertDailyFxRateForAdmin.mockRejectedValueOnce(new Error('db unavailable'));

    const result = await upsertDailyFxRateAdminAction({
      sourceCurrency: 'USD',
      effectiveDate: '2026-02-20',
      rateToMxn: 19.45,
      reason: 'manual-rate-adjustment',
    });

    expect(result).toEqual({
      ok: false,
      error: 'SERVER_ERROR',
      message: 'SERVER_ERROR',
    });
  });

  it('lists configured daily FX rates for staff users', async () => {
    const now = new Date('2026-02-25T12:00:00.000Z');
    mockListDailyFxRatesForAdmin.mockResolvedValue([
      {
        id: 'fx-rate-1',
        sourceCurrency: 'USD',
        quoteCurrency: 'MXN',
        effectiveDate: new Date('2026-02-20T00:00:00.000Z'),
        rateMicroMxn: 19450000,
        rateToMxn: 19.45,
        updatedReason: 'manual-rate-adjustment',
        updatedByUserId: 'staff-user-1',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const result = await listDailyFxRatesAdminAction();

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'fx-rate-1',
            sourceCurrency: 'USD',
          }),
        ]),
      }),
    );
  });

  it('returns SERVER_ERROR when listing daily FX rates fails', async () => {
    mockListDailyFxRatesForAdmin.mockRejectedValueOnce(new Error('query failed'));

    const result = await listDailyFxRatesAdminAction();

    expect(result).toEqual({
      ok: false,
      error: 'SERVER_ERROR',
      message: 'SERVER_ERROR',
    });
  });

  it('returns FX action flags and handles service failures', async () => {
    mockGetFxRateActionFlagsForAdmin.mockResolvedValueOnce({
      checkedCurrencies: ['USD'],
      missingRates: [],
      staleRates: [],
      hasActions: false,
    });

    const success = await getFxRateActionFlagsAdminAction();
    expect(success).toEqual({
      ok: true,
      data: {
        checkedCurrencies: ['USD'],
        missingRates: [],
        staleRates: [],
        hasActions: false,
      },
    });

    mockGetFxRateActionFlagsForAdmin.mockRejectedValueOnce(new Error('aggregation failed'));
    const failure = await getFxRateActionFlagsAdminAction();

    expect(failure).toEqual({
      ok: false,
      error: 'SERVER_ERROR',
      message: 'SERVER_ERROR',
    });
  });
});
