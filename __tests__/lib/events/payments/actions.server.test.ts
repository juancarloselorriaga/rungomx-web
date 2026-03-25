const mockTransaction = jest.fn();
const mockGetRegistrationForOwnerOrThrow = jest.fn();
const mockIngestMoneyMutationFromServerActionInTransaction = jest.fn();
const mockCreateAuditLog = jest.fn();
const mockGetRequestContext = jest.fn();
const mockSendRegistrationCompletionEmail = jest.fn();
const mockRevalidatePublicEventByEditionId = jest.fn();
const mockRevalidateTag = jest.fn();
const mockRefresh = jest.fn();
const mockHeaders = jest.fn();

const mockAuthContext = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'runner@example.com',
    name: 'Runner Test',
  },
  profile: {
    locale: 'en',
  },
};

jest.mock('@/db', () => ({
  db: {
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

jest.mock('@/lib/auth/action-wrapper', () => ({
  withAuthenticatedUser:
    () =>
    (action: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      action(mockAuthContext, ...args),
}));

jest.mock('@/lib/events/registrations/ownership', () => ({
  getRegistrationForOwnerOrThrow: (...args: unknown[]) => mockGetRegistrationForOwnerOrThrow(...args),
  RegistrationOwnershipError: class RegistrationOwnershipError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

jest.mock('@/lib/payments/core/mutation-ingress-paths', () => ({
  ingestMoneyMutationFromServerActionInTransaction: (...args: unknown[]) =>
    mockIngestMoneyMutationFromServerActionInTransaction(...args),
}));

jest.mock('@/lib/audit', () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
  getRequestContext: (...args: unknown[]) => mockGetRequestContext(...args),
}));

jest.mock('@/lib/events/registration-email', () => ({
  sendRegistrationCompletionEmail: (...args: unknown[]) => mockSendRegistrationCompletionEmail(...args),
}));

jest.mock('@/lib/events/shared/action-helpers', () => ({
  revalidatePublicEventByEditionId: (...args: unknown[]) => mockRevalidatePublicEventByEditionId(...args),
}));

jest.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
  refresh: (...args: unknown[]) => mockRefresh(...args),
}));

jest.mock('next/headers', () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

import { demoPayRegistration } from '@/lib/events/payments/actions';

function buildRegistration(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    editionId: '33333333-3333-4333-8333-333333333333',
    status: 'payment_pending',
    expiresAt: new Date('2026-03-09T14:00:00.000Z'),
    buyerUserId: mockAuthContext.user.id,
    basePriceCents: 10_000,
    feesCents: 500,
    taxCents: 0,
    totalCents: 10_500,
    ...overrides,
  };
}

function buildTransactionMocks(params?: {
  organizationId?: string | null;
  updatedRegistration?: { id: string; status: string };
}) {
  const updateWhere = jest.fn().mockReturnValue({
    returning: jest
      .fn()
      .mockResolvedValue([params?.updatedRegistration ?? { id: '22222222-2222-4222-8222-222222222222', status: 'confirmed' }]),
  });

  const tx = {
    query: {
      eventEditions: {
        findFirst: jest.fn().mockResolvedValue({
          series: {
            organizationId:
              params?.organizationId === undefined
                ? '44444444-4444-4444-8444-444444444444'
                : params.organizationId,
          },
        }),
      },
    },
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: updateWhere,
      }),
    }),
  };

  return { tx, updateWhere };
}

describe('demoPayRegistration', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    mockTransaction.mockReset();
    mockGetRegistrationForOwnerOrThrow.mockReset();
    mockIngestMoneyMutationFromServerActionInTransaction.mockReset();
    mockCreateAuditLog.mockReset();
    mockGetRequestContext.mockReset();
    mockSendRegistrationCompletionEmail.mockReset();
    mockRevalidatePublicEventByEditionId.mockReset();
    mockRevalidateTag.mockReset();
    mockRefresh.mockReset();
    mockHeaders.mockReset();

    mockCreateAuditLog.mockResolvedValue({ ok: true, auditLogId: 'audit-1' });
    mockGetRequestContext.mockResolvedValue({ ipAddress: '127.0.0.1', userAgent: 'jest' });
    mockSendRegistrationCompletionEmail.mockResolvedValue(undefined);
    mockRevalidatePublicEventByEditionId.mockResolvedValue(undefined);
    mockHeaders.mockResolvedValue(new Headers());
    mockIngestMoneyMutationFromServerActionInTransaction.mockResolvedValue({
      traceId: 'payment-capture:22222222-2222-4222-8222-222222222222',
      persistedEvents: [],
      deduplicated: false,
    });
    process.env.NEXT_PUBLIC_FEATURE_EVENTS_DEMO_PAYMENTS = 'true';
    delete process.env.VERCEL_ENV;
    process.env.EVENTS_DEMO_PAYMENTS_ALLOW_PRODUCTION = 'false';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('confirms the registration and appends a canonical payment capture event', async () => {
    const registration = buildRegistration();
    const { tx } = buildTransactionMocks();

    mockGetRegistrationForOwnerOrThrow.mockResolvedValue(registration);
    mockTransaction.mockImplementation(async (callback: (input: unknown) => Promise<unknown>) =>
      callback(tx),
    );

    const result = await demoPayRegistration({ registrationId: registration.id });

    expect(result).toEqual({
      ok: true,
      data: {
        id: registration.id,
        status: 'confirmed',
      },
    });

    expect(mockIngestMoneyMutationFromServerActionInTransaction).toHaveBeenCalledTimes(1);
    const [transactionArg, ingressCommand] =
      mockIngestMoneyMutationFromServerActionInTransaction.mock.calls[0];

    expect(transactionArg).toBe(tx);
    expect(ingressCommand.traceId).toBe(`payment-capture:${registration.id}`);
    expect(ingressCommand.idempotencyKey).toBe(`payment-capture:${registration.id}`);
    expect(ingressCommand.organizerId).toBe('44444444-4444-4444-8444-444444444444');
    expect(ingressCommand.events).toHaveLength(1);
    expect(ingressCommand.events[0]).toMatchObject({
      traceId: `payment-capture:${registration.id}`,
      eventName: 'payment.captured',
      entityType: 'registration',
      entityId: registration.id,
      source: 'api',
      payload: {
        organizerId: '44444444-4444-4444-8444-444444444444',
        registrationId: registration.id,
        grossAmount: { amountMinor: 10_500, currency: 'MXN' },
        feeAmount: { amountMinor: 500, currency: 'MXN' },
        netAmount: { amountMinor: 10_000, currency: 'MXN' },
      },
      metadata: {
        simulationMode: 'demo_pay',
      },
    });

    expect(mockSendRegistrationCompletionEmail).toHaveBeenCalledWith({
      registrationId: registration.id,
      userId: mockAuthContext.user.id,
      status: 'confirmed',
      userEmail: mockAuthContext.user.email,
      userName: mockAuthContext.user.name,
      locale: 'en',
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not wait for the confirmation email before returning success', async () => {
    const registration = buildRegistration();
    const { tx } = buildTransactionMocks();

    mockGetRegistrationForOwnerOrThrow.mockResolvedValue(registration);
    mockTransaction.mockImplementation(async (callback: (input: unknown) => Promise<unknown>) =>
      callback(tx),
    );

    let resolveEmail: (() => void) | undefined;
    mockSendRegistrationCompletionEmail.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveEmail = resolve;
        }),
    );

    const resultPromise = demoPayRegistration({ registrationId: registration.id });
    await expect(resultPromise).resolves.toEqual({
      ok: true,
      data: {
        id: registration.id,
        status: 'confirmed',
      },
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockSendRegistrationCompletionEmail).toHaveBeenCalledTimes(1);

    resolveEmail?.();
  });

  it('returns early for already confirmed registrations without appending capture events', async () => {
    const registration = buildRegistration({ status: 'confirmed' });
    mockGetRegistrationForOwnerOrThrow.mockResolvedValue(registration);

    const result = await demoPayRegistration({ registrationId: registration.id });

    expect(result).toEqual({
      ok: true,
      data: {
        id: registration.id,
        status: 'confirmed',
      },
    });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromServerActionInTransaction).not.toHaveBeenCalled();
    expect(mockSendRegistrationCompletionEmail).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('rolls back the transaction when capture ingress fails', async () => {
    const registration = buildRegistration();
    const { tx } = buildTransactionMocks();

    mockGetRegistrationForOwnerOrThrow.mockResolvedValue(registration);
    mockIngestMoneyMutationFromServerActionInTransaction.mockRejectedValue(new Error('INGRESS_FAILED'));
    mockTransaction.mockImplementation(async (callback: (input: unknown) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(demoPayRegistration({ registrationId: registration.id })).rejects.toThrow(
      'INGRESS_FAILED',
    );

    expect(mockCreateAuditLog).not.toHaveBeenCalled();
    expect(mockSendRegistrationCompletionEmail).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
