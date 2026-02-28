const mockFindFirstRefundRequest = jest.fn();
const mockFindFirstUser = jest.fn();
const mockFindManyUsers = jest.fn();
const mockFindManyOrganizationMemberships = jest.fn();
const mockFindManyMoneyEvents = jest.fn();
const mockUpdate = jest.fn();
const mockSet = jest.fn();
const mockWhere = jest.fn();
const mockUpdateReturning = jest.fn();

const mockIngestMoneyMutationFromApi = jest.fn();
const mockIngestMoneyMutationFromWorker = jest.fn();
const mockSendEmail = jest.fn();

jest.mock('@/db', () => ({
  db: {
    query: {
      refundRequests: {
        findFirst: (...args: unknown[]) => mockFindFirstRefundRequest(...args),
      },
      users: {
        findFirst: (...args: unknown[]) => mockFindFirstUser(...args),
        findMany: (...args: unknown[]) => mockFindManyUsers(...args),
      },
      organizationMemberships: {
        findMany: (...args: unknown[]) => mockFindManyOrganizationMemberships(...args),
      },
      moneyEvents: {
        findMany: (...args: unknown[]) => mockFindManyMoneyEvents(...args),
      },
    },
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

jest.mock('@/lib/payments/core/mutation-ingress-paths', () => ({
  ingestMoneyMutationFromApi: (...args: unknown[]) => mockIngestMoneyMutationFromApi(...args),
  ingestMoneyMutationFromWorker: (...args: unknown[]) => mockIngestMoneyMutationFromWorker(...args),
}));

jest.mock('@/lib/email', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

import {
  executeRefundRequest,
  RefundExecutionError,
} from '@/lib/payments/refunds/refund-execution';

describe('refund execution domain service', () => {
  const now = new Date('2026-02-23T23:10:00.000Z');
  const defaultParams = (overrides: Partial<Parameters<typeof executeRefundRequest>[0]> = {}) => ({
    refundRequestId: '22222222-2222-4222-8222-222222222222',
    organizerId: '11111111-1111-4111-8111-111111111111',
    executedByUserId: '55555555-5555-4555-8555-555555555555',
    requestedAmountMinor: 100,
    maxRefundableToAttendeeMinorPerRun: 1200,
    runtime: 'web' as const,
    executionMode: 'in_process' as const,
    nodeEnv: 'test',
    now,
    ...overrides,
  });

  beforeEach(() => {
    mockFindFirstRefundRequest.mockReset();
    mockFindFirstUser.mockReset();
    mockFindManyUsers.mockReset();
    mockFindManyOrganizationMemberships.mockReset();
    mockFindManyMoneyEvents.mockReset();
    mockUpdate.mockReset();
    mockSet.mockReset();
    mockWhere.mockReset();
    mockUpdateReturning.mockReset();
    mockIngestMoneyMutationFromApi.mockReset();
    mockIngestMoneyMutationFromWorker.mockReset();
    mockSendEmail.mockReset();

    mockUpdate.mockImplementation(() => ({
      set: (...setArgs: unknown[]) => {
        mockSet(...setArgs);
        return {
          where: (...whereArgs: unknown[]) => {
            mockWhere(...whereArgs);
            return {
              returning: (...returningArgs: unknown[]) => mockUpdateReturning(...returningArgs),
            };
          },
        };
      },
    }));

    mockFindFirstRefundRequest.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      registrationId: '33333333-3333-4333-8333-333333333333',
      organizerId: '11111111-1111-4111-8111-111111111111',
      attendeeUserId: '44444444-4444-4444-8444-444444444444',
      status: 'approved',
      reasonCode: 'medical',
      eligibilitySnapshotJson: { version: 'refund-request-eligibility-v1' },
      financialSnapshotJson: { maxRefundableToAttendeeMinor: 1400 },
      decidedByUserId: '55555555-5555-4555-8555-555555555555',
    });
    mockFindFirstUser.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      email: 'attendee@example.com',
      name: 'Attendee User',
    });
    mockFindManyOrganizationMemberships.mockResolvedValue([
      {
        userId: '66666666-6666-4666-8666-666666666666',
      },
    ]);
    mockFindManyUsers.mockResolvedValue([
      {
        id: '66666666-6666-4666-8666-666666666666',
        email: 'organizer@example.com',
        name: 'Organizer User',
      },
    ]);
    mockFindManyMoneyEvents.mockResolvedValue([]);
    mockIngestMoneyMutationFromApi.mockResolvedValue({
      traceId: 'refund-execution:22222222-2222-4222-8222-222222222222',
      persistedEvents: [],
      deduplicated: false,
    });
    mockIngestMoneyMutationFromWorker.mockResolvedValue({
      traceId: 'refund-execution:22222222-2222-4222-8222-222222222222',
      persistedEvents: [],
      deduplicated: false,
    });
    mockUpdateReturning.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        registrationId: '33333333-3333-4333-8333-333333333333',
        organizerId: '11111111-1111-4111-8111-111111111111',
        attendeeUserId: '44444444-4444-4444-8444-444444444444',
        status: 'executed',
        reasonCode: 'medical',
        executedAt: now,
      },
    ]);
    mockSendEmail.mockResolvedValue({ body: { messageId: 'ok' } });
  });

  it('executes approved request with per-run max guard, ingress path, and notifications', async () => {
    const result = await executeRefundRequest({
      refundRequestId: '22222222-2222-4222-8222-222222222222',
      organizerId: '11111111-1111-4111-8111-111111111111',
      executedByUserId: '55555555-5555-4555-8555-555555555555',
      requestedAmountMinor: 600,
      maxRefundableToAttendeeMinorPerRun: 1200,
      runtime: 'web',
      executionMode: 'in_process',
      nodeEnv: 'test',
      now,
    });

    expect(result.status).toBe('executed');
    expect(result.traceId).toBe('refund-execution:22222222-2222-4222-8222-222222222222');
    expect(result.maxRefundableToAttendeeMinorPerRun).toBe(1200);
    expect(result.effectiveMaxRefundableMinor).toBe(1200);
    expect(result.alreadyRefundedMinor).toBe(0);
    expect(result.remainingRefundableBeforeMinor).toBe(1200);
    expect(result.remainingRefundableAfterMinor).toBe(600);
    expect(result.notifications.channels).toEqual(['in_app', 'email']);
    expect(result.notifications.attendee.emailStatus).toBe('sent');
    expect(result.notifications.organizer.emailStatus).toBe('sent');

    expect(mockIngestMoneyMutationFromApi).toHaveBeenCalledTimes(1);
    expect(mockIngestMoneyMutationFromApi.mock.calls[0]![0]).toMatchObject({
      traceId: 'refund-execution:22222222-2222-4222-8222-222222222222',
      organizerId: '11111111-1111-4111-8111-111111111111',
      idempotencyKey: 'refund-execution:22222222-2222-4222-8222-222222222222',
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);

    const updatePayload = mockSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(updatePayload.status).toBe('executed');
    expect(updatePayload.executedAt).toBe(now);
    const financialSnapshot = (updatePayload.financialSnapshotJson ?? {}) as Record<
      string,
      unknown
    >;
    const execution = (financialSnapshot.execution ?? {}) as Record<string, unknown>;
    expect(execution.traceId).toBe('refund-execution:22222222-2222-4222-8222-222222222222');
    expect(execution.maxRefundableToAttendeeMinorPerRun).toBe(1200);
    expect(execution.notificationChannels).toEqual(['in_app', 'email']);
  });

  it('rejects execution when requested amount exceeds remaining refundable capacity', async () => {
    mockFindManyMoneyEvents.mockResolvedValue([
      {
        payloadJson: {
          registrationId: '33333333-3333-4333-8333-333333333333',
          refundAmount: { amountMinor: 1100 },
        },
      },
    ]);

    await expect(
      executeRefundRequest({
        refundRequestId: '22222222-2222-4222-8222-222222222222',
        organizerId: '11111111-1111-4111-8111-111111111111',
        executedByUserId: '55555555-5555-4555-8555-555555555555',
        requestedAmountMinor: 200,
        maxRefundableToAttendeeMinorPerRun: 1200,
        runtime: 'web',
        executionMode: 'in_process',
        nodeEnv: 'test',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'REFUND_MAX_REFUNDABLE_EXCEEDED',
    });

    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('blocks in_process execution mode in production', async () => {
    await expect(
      executeRefundRequest({
        refundRequestId: '22222222-2222-4222-8222-222222222222',
        organizerId: '11111111-1111-4111-8111-111111111111',
        executedByUserId: '55555555-5555-4555-8555-555555555555',
        requestedAmountMinor: 100,
        maxRefundableToAttendeeMinorPerRun: 1200,
        runtime: 'web',
        executionMode: 'in_process',
        nodeEnv: 'production',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'REFUND_EXECUTION_MODE_BLOCKED',
    });

    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
  });

  it('requires worker runtime for production refund processors', async () => {
    await expect(
      executeRefundRequest({
        refundRequestId: '22222222-2222-4222-8222-222222222222',
        organizerId: '11111111-1111-4111-8111-111111111111',
        executedByUserId: '55555555-5555-4555-8555-555555555555',
        requestedAmountMinor: 100,
        maxRefundableToAttendeeMinorPerRun: 1200,
        runtime: 'web',
        executionMode: 'queued_worker',
        nodeEnv: 'production',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'REFUND_RUNTIME_BLOCKED',
    });

    await expect(
      executeRefundRequest({
        refundRequestId: '22222222-2222-4222-8222-222222222222',
        organizerId: '11111111-1111-4111-8111-111111111111',
        executedByUserId: '55555555-5555-4555-8555-555555555555',
        requestedAmountMinor: 100,
        maxRefundableToAttendeeMinorPerRun: 1200,
        runtime: 'worker',
        executionMode: 'queued_worker',
        nodeEnv: 'production',
        now,
      }),
    ).resolves.toMatchObject({
      status: 'executed',
      runtime: 'worker',
      executionMode: 'queued_worker',
    });

    expect(mockIngestMoneyMutationFromWorker).toHaveBeenCalledTimes(1);
  });

  it('rejects non-executable workflow states and already-executed requests', async () => {
    mockFindFirstRefundRequest.mockResolvedValueOnce({
      id: '22222222-2222-4222-8222-222222222222',
      registrationId: '33333333-3333-4333-8333-333333333333',
      organizerId: '11111111-1111-4111-8111-111111111111',
      attendeeUserId: '44444444-4444-4444-8444-444444444444',
      status: 'denied',
      reasonCode: 'medical',
      eligibilitySnapshotJson: {},
      financialSnapshotJson: { maxRefundableToAttendeeMinor: 1400 },
      decidedByUserId: '55555555-5555-4555-8555-555555555555',
    });

    await expect(
      executeRefundRequest({
        refundRequestId: '22222222-2222-4222-8222-222222222222',
        organizerId: '11111111-1111-4111-8111-111111111111',
        executedByUserId: '55555555-5555-4555-8555-555555555555',
        requestedAmountMinor: 100,
        maxRefundableToAttendeeMinorPerRun: 1200,
        runtime: 'web',
        executionMode: 'in_process',
        nodeEnv: 'test',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'REFUND_REQUEST_NOT_EXECUTABLE',
    });

    mockFindFirstRefundRequest.mockResolvedValueOnce({
      id: '22222222-2222-4222-8222-222222222222',
      registrationId: '33333333-3333-4333-8333-333333333333',
      organizerId: '11111111-1111-4111-8111-111111111111',
      attendeeUserId: '44444444-4444-4444-8444-444444444444',
      status: 'executed',
      reasonCode: 'medical',
      eligibilitySnapshotJson: {},
      financialSnapshotJson: { maxRefundableToAttendeeMinor: 1400 },
      decidedByUserId: '55555555-5555-4555-8555-555555555555',
    });

    await expect(
      executeRefundRequest({
        refundRequestId: '22222222-2222-4222-8222-222222222222',
        organizerId: '11111111-1111-4111-8111-111111111111',
        executedByUserId: '55555555-5555-4555-8555-555555555555',
        requestedAmountMinor: 100,
        maxRefundableToAttendeeMinorPerRun: 1200,
        runtime: 'web',
        executionMode: 'in_process',
        nodeEnv: 'test',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'REFUND_REQUEST_ALREADY_EXECUTED',
    });

    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns domain error type for consumers that need code-based mapping', async () => {
    mockFindFirstRefundRequest.mockResolvedValue(null);

    let caught: unknown;
    try {
      await executeRefundRequest({
        refundRequestId: '22222222-2222-4222-8222-222222222222',
        organizerId: '11111111-1111-4111-8111-111111111111',
        executedByUserId: '55555555-5555-4555-8555-555555555555',
        requestedAmountMinor: 100,
        maxRefundableToAttendeeMinorPerRun: 1200,
        runtime: 'web',
        executionMode: 'in_process',
        nodeEnv: 'test',
        now,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RefundExecutionError);
    expect((caught as RefundExecutionError).code).toBe('REFUND_REQUEST_NOT_FOUND');
  });

  it('validates requested amount and per-run max inputs before any persistence work', async () => {
    await expect(
      executeRefundRequest(
        defaultParams({
          requestedAmountMinor: 0,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUESTED_AMOUNT',
    });

    await expect(
      executeRefundRequest(
        defaultParams({
          requestedAmountMinor: 100.5,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUESTED_AMOUNT',
    });

    await expect(
      executeRefundRequest(
        defaultParams({
          maxRefundableToAttendeeMinorPerRun: -1,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_MAX_REFUNDABLE_PER_RUN',
    });

    await expect(
      executeRefundRequest(
        defaultParams({
          maxRefundableToAttendeeMinorPerRun: 1200.1,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_MAX_REFUNDABLE_PER_RUN',
    });

    expect(mockFindFirstRefundRequest).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('executes goodwill escalated requests and falls back to goodwill reason code in event payload', async () => {
    mockFindFirstRefundRequest.mockResolvedValueOnce({
      id: '22222222-2222-4222-8222-222222222222',
      registrationId: '33333333-3333-4333-8333-333333333333',
      organizerId: '11111111-1111-4111-8111-111111111111',
      attendeeUserId: '44444444-4444-4444-8444-444444444444',
      status: 'escalated_admin_review',
      reasonCode: '',
      eligibilitySnapshotJson: {
        source: 'goodwill',
      },
      financialSnapshotJson: null,
      decidedByUserId: '55555555-5555-4555-8555-555555555555',
    });

    const result = await executeRefundRequest(
      defaultParams({
        requestedAmountMinor: 400,
        maxRefundableToAttendeeMinorPerRun: 900,
      }),
    );

    expect(result.status).toBe('executed');
    expect(result.effectiveMaxRefundableMinor).toBe(900);

    const ingestInput = mockIngestMoneyMutationFromApi.mock.calls[0]![0] as {
      events: Array<{ payload: { reasonCode: string } }>;
    };
    expect(ingestInput.events[0]!.payload.reasonCode).toBe('goodwill_manual');
  });

  it('rejects execution when attendee notification target is missing', async () => {
    mockFindFirstUser.mockResolvedValueOnce(null);

    await expect(executeRefundRequest(defaultParams())).rejects.toMatchObject({
      code: 'ATTENDEE_NOTIFICATION_TARGET_MISSING',
    });

    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects execution when organizer notification candidate list resolves empty', async () => {
    mockFindFirstRefundRequest.mockResolvedValueOnce({
      id: '22222222-2222-4222-8222-222222222222',
      registrationId: '33333333-3333-4333-8333-333333333333',
      organizerId: '11111111-1111-4111-8111-111111111111',
      attendeeUserId: '44444444-4444-4444-8444-444444444444',
      status: 'approved',
      reasonCode: 'medical',
      eligibilitySnapshotJson: { version: 'refund-request-eligibility-v1' },
      financialSnapshotJson: { maxRefundableToAttendeeMinor: 1400 },
      decidedByUserId: null,
    });
    mockFindManyOrganizationMemberships.mockResolvedValueOnce([]);

    await expect(
      executeRefundRequest(
        defaultParams({
          executedByUserId: '44444444-4444-4444-8444-444444444444',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'ORGANIZER_NOTIFICATION_TARGET_MISSING',
    });

    expect(mockFindManyUsers).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
  });

  it('rejects execution when organizer users cannot be resolved from candidate ids', async () => {
    mockFindManyUsers.mockResolvedValueOnce([]);

    await expect(executeRefundRequest(defaultParams())).rejects.toMatchObject({
      code: 'ORGANIZER_NOTIFICATION_TARGET_MISSING',
    });

    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('maps update race conditions to already-executed error when latest state is executed', async () => {
    mockFindFirstRefundRequest
      .mockResolvedValueOnce({
        id: '22222222-2222-4222-8222-222222222222',
        registrationId: '33333333-3333-4333-8333-333333333333',
        organizerId: '11111111-1111-4111-8111-111111111111',
        attendeeUserId: '44444444-4444-4444-8444-444444444444',
        status: 'approved',
        reasonCode: 'medical',
        eligibilitySnapshotJson: { version: 'refund-request-eligibility-v1' },
        financialSnapshotJson: { maxRefundableToAttendeeMinor: 1400 },
        decidedByUserId: '55555555-5555-4555-8555-555555555555',
      })
      .mockResolvedValueOnce({
        status: 'executed',
      });
    mockUpdateReturning.mockResolvedValueOnce([]);

    await expect(executeRefundRequest(defaultParams())).rejects.toMatchObject({
      code: 'REFUND_REQUEST_ALREADY_EXECUTED',
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('maps non-executed update conflicts to update failed domain error', async () => {
    mockFindFirstRefundRequest
      .mockResolvedValueOnce({
        id: '22222222-2222-4222-8222-222222222222',
        registrationId: '33333333-3333-4333-8333-333333333333',
        organizerId: '11111111-1111-4111-8111-111111111111',
        attendeeUserId: '44444444-4444-4444-8444-444444444444',
        status: 'approved',
        reasonCode: 'medical',
        eligibilitySnapshotJson: { version: 'refund-request-eligibility-v1' },
        financialSnapshotJson: { maxRefundableToAttendeeMinor: 1400 },
        decidedByUserId: '55555555-5555-4555-8555-555555555555',
      })
      .mockResolvedValueOnce({
        status: 'approved',
      });
    mockUpdateReturning.mockResolvedValueOnce([]);

    await expect(executeRefundRequest(defaultParams())).rejects.toMatchObject({
      code: 'REFUND_EXECUTION_UPDATE_FAILED',
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns failed email status when notification delivery throws but keeps execution successful', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSendEmail
      .mockRejectedValueOnce(new Error('smtp unavailable'))
      .mockResolvedValueOnce({ body: { messageId: 'organizer-ok' } });

    try {
      const result = await executeRefundRequest(defaultParams());

      expect(result.status).toBe('executed');
      expect(result.notifications.attendee.emailStatus).toBe('failed');
      expect(result.notifications.organizer.emailStatus).toBe('sent');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
