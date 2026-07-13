const mockTransaction = jest.fn();
const mockIngestMoneyMutationFromApiInTransaction = jest.fn();
const mockIngestMoneyMutationFromServerActionInTransaction = jest.fn();
const mockCreateAuditLog = jest.fn();
const mockGetRequestContext = jest.fn();
const mockHeaders = jest.fn();

jest.mock('@/db', () => ({
  db: {
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

jest.mock('@/lib/payments/core/mutation-ingress-paths', () => ({
  ingestMoneyMutationFromApiInTransaction: (...args: unknown[]) =>
    mockIngestMoneyMutationFromApiInTransaction(...args),
  ingestMoneyMutationFromServerActionInTransaction: (...args: unknown[]) =>
    mockIngestMoneyMutationFromServerActionInTransaction(...args),
}));

jest.mock('@/lib/audit', () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
  getRequestContext: (...args: unknown[]) => mockGetRequestContext(...args),
}));

jest.mock('next/headers', () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

import { confirmRegistrationPaymentCapture } from '@/lib/events/payments/confirm-capture';

const registrationId = '22222222-2222-4222-8222-222222222222';
const organizerId = '44444444-4444-4444-8444-444444444444';
const actorUserId = '11111111-1111-4111-8111-111111111111';
const occurredAt = new Date('2026-03-09T12:00:00.000Z');

function buildTransactionMocks(
  returningRows: Array<{ id: string; status: string }> = [
    { id: registrationId, status: 'confirmed' },
  ],
  // Only consulted on a CAS miss (P2b reconciliation): the core issues two
  // sequential `tx.select(...).from(...).where(...)` calls (registration
  // lookup, then payment.captured event lookup) and each entry here answers
  // one call in order. Defaults to "nothing found" for both, so a CAS miss
  // still surfaces INVALID_STATE_TRANSITION unless a test explicitly seeds a
  // reconciling redelivery.
  selectResults: unknown[][] = [],
) {
  const updateWhere = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue(returningRows),
  });

  let selectCallCount = 0;
  const selectWhere = jest.fn().mockImplementation(() => {
    const result = selectResults[selectCallCount] ?? [];
    selectCallCount += 1;
    return Promise.resolve(result);
  });

  const tx = {
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: updateWhere,
      }),
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: selectWhere,
      }),
    }),
  };

  return { tx, updateWhere, selectWhere };
}

function defaultParams(overrides: Partial<Parameters<typeof confirmRegistrationPaymentCapture>[0]> = {}) {
  return {
    registrationId,
    organizerId,
    grossAmountMinor: 10_500,
    feeAmountMinor: 500,
    netAmountMinor: 10_000,
    source: 'api' as const,
    idempotencyKey: `payment-capture:${registrationId}`,
    occurredAt,
    auditAction: 'registration.demo_pay' as const,
    actorUserId,
    ...overrides,
  };
}

describe('confirmRegistrationPaymentCapture', () => {
  beforeEach(() => {
    mockTransaction.mockReset();
    mockIngestMoneyMutationFromApiInTransaction.mockReset();
    mockIngestMoneyMutationFromServerActionInTransaction.mockReset();
    mockCreateAuditLog.mockReset();
    mockGetRequestContext.mockReset();
    mockHeaders.mockReset();

    mockCreateAuditLog.mockResolvedValue({ ok: true, auditLogId: 'audit-1' });
    mockGetRequestContext.mockResolvedValue({ ipAddress: '127.0.0.1', userAgent: 'jest' });
    mockHeaders.mockResolvedValue(new Headers());
    mockIngestMoneyMutationFromApiInTransaction.mockResolvedValue({
      traceId: `payment-capture:${registrationId}`,
      persistedEvents: [],
      deduplicated: false,
    });
    mockIngestMoneyMutationFromServerActionInTransaction.mockResolvedValue({
      traceId: `payment-capture:${registrationId}`,
      persistedEvents: [],
      deduplicated: false,
    });
  });

  it('CASes payment_pending -> confirmed and ingests payment.captured in one transaction', async () => {
    const { tx } = buildTransactionMocks();
    mockTransaction.mockImplementation(async (callback: (input: unknown) => Promise<unknown>) =>
      callback(tx),
    );

    // defaultParams() uses source: 'api', so this must route through the API
    // ingress wrapper rather than the server-action one (P2a).
    const result = await confirmRegistrationPaymentCapture(defaultParams());

    expect(result).toEqual({ id: registrationId, status: 'confirmed' });
    expect(mockIngestMoneyMutationFromApiInTransaction).toHaveBeenCalledTimes(1);
    expect(mockIngestMoneyMutationFromServerActionInTransaction).not.toHaveBeenCalled();

    const [transactionArg, ingressCommand] = mockIngestMoneyMutationFromApiInTransaction.mock.calls[0];
    expect(transactionArg).toBe(tx);
    expect(ingressCommand.events).toHaveLength(1);
    expect(ingressCommand.events[0]).toMatchObject({
      eventName: 'payment.captured',
      entityType: 'registration',
      entityId: registrationId,
      source: 'api',
      payload: {
        organizerId,
        registrationId,
        grossAmount: { amountMinor: 10_500, currency: 'MXN' },
        feeAmount: { amountMinor: 500, currency: 'MXN' },
        netAmount: { amountMinor: 10_000, currency: 'MXN' },
      },
    });

    expect(mockCreateAuditLog).toHaveBeenCalledTimes(1);
  });

  it('throws the same invalid-state-transition error demo pay surfaces today when the CAS misses', async () => {
    const { tx } = buildTransactionMocks([]);
    mockTransaction.mockImplementation(async (callback: (input: unknown) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(confirmRegistrationPaymentCapture(defaultParams())).rejects.toThrow(
      'INVALID_STATE_TRANSITION',
    );

    expect(mockIngestMoneyMutationFromServerActionInTransaction).not.toHaveBeenCalled();
    expect(mockCreateAuditLog).not.toHaveBeenCalled();
  });

  it('skips the audit write but warns observably when no actorUserId is provided', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { tx } = buildTransactionMocks();
    mockTransaction.mockImplementation(async (callback: (input: unknown) => Promise<unknown>) =>
      callback(tx),
    );

    try {
      const result = await confirmRegistrationPaymentCapture(
        defaultParams({ actorUserId: undefined }),
      );

      expect(result).toEqual({ id: registrationId, status: 'confirmed' });
      expect(mockCreateAuditLog).not.toHaveBeenCalled();
      expect(mockGetRequestContext).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[payments-capture] audit skipped: no actorUserId',
        { registrationId },
      );
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });
});
