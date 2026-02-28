export {};

type MockAuthContext = {
  user: { id: string };
};

const defaultAuthContext: MockAuthContext = {
  user: { id: 'staff-user-1' },
};

class MockArtifactGovernanceError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const mockWithStaffUser = jest.fn();
const mockHeaders = jest.fn();
const mockGetRequestContext = jest.fn();
const mockRebuildArtifactForTrace = jest.fn();
const mockResendArtifactForTrace = jest.fn();
const mockGetArtifactGovernanceSummary = jest.fn();

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

jest.mock('@/lib/payments/artifacts/governance', () => ({
  ArtifactGovernanceError: MockArtifactGovernanceError,
  rebuildArtifactForTrace: (...args: unknown[]) => mockRebuildArtifactForTrace(...args),
  resendArtifactForTrace: (...args: unknown[]) => mockResendArtifactForTrace(...args),
  getArtifactGovernanceSummary: (...args: unknown[]) => mockGetArtifactGovernanceSummary(...args),
}));

const {
  runArtifactGovernanceAdminAction,
  listArtifactGovernanceSummaryAdminAction,
} = require('@/app/actions/admin-payments-artifacts') as typeof import('@/app/actions/admin-payments-artifacts');

describe('admin payments artifact governance actions', () => {
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

  it('returns UNAUTHENTICATED when staff auth wrapper blocks governance action', async () => {
    mockWithStaffUser.mockReturnValue({ unauthenticated: true });

    const result = await runArtifactGovernanceAdminAction({
      operation: 'rebuild',
      traceId: 'trace-1',
      artifactType: 'payout_statement',
      reasonCode: 'manual_rebuild',
    });

    expect(result).toEqual({
      ok: false,
      error: 'UNAUTHENTICATED',
      message: 'UNAUTHENTICATED',
    });
    expect(mockRebuildArtifactForTrace).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when staff auth wrapper blocks governance summary action', async () => {
    mockWithStaffUser.mockReturnValue({ forbidden: true });

    const result = await listArtifactGovernanceSummaryAdminAction();

    expect(result).toEqual({
      ok: false,
      error: 'FORBIDDEN',
      message: 'FORBIDDEN',
    });
    expect(mockGetArtifactGovernanceSummary).not.toHaveBeenCalled();
  });

  it('returns INVALID_INPUT for malformed governance request', async () => {
    const result = await runArtifactGovernanceAdminAction({
      operation: 'rebuild',
      traceId: '',
      artifactType: 'unsupported_type',
      reasonCode: 'x',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: 'INVALID_INPUT',
        fieldErrors: expect.any(Object),
      }),
    );
    expect(mockRebuildArtifactForTrace).not.toHaveBeenCalled();
    expect(mockResendArtifactForTrace).not.toHaveBeenCalled();
  });

  it('runs rebuild governance operation and maps response payload', async () => {
    const now = new Date('2026-02-25T12:00:00.000Z');
    mockRebuildArtifactForTrace.mockResolvedValue({
      version: {
        id: 'version-2',
        traceId: 'trace-1',
        artifactType: 'payout_statement',
        artifactVersion: 2,
        fingerprint: 'fingerprint-v2',
        rebuiltFromVersionId: 'version-1',
        reasonCode: 'manual_rebuild',
        requestedByUserId: 'staff-user-1',
        createdAt: now,
      },
      delivery: {
        id: 'delivery-2',
        artifactVersionId: 'version-2',
        traceId: 'trace-1',
        artifactType: 'payout_statement',
        channel: 'support_portal',
        recipientReference: 'support:trace-1',
        reasonCode: 'manual_rebuild',
        requestedByUserId: 'staff-user-1',
        createdAt: now,
      },
    });

    const formData = new FormData();
    formData.set('operation', 'rebuild');
    formData.set('traceId', 'trace-1');
    formData.set('artifactType', 'payout_statement');
    formData.set('reasonCode', 'manual_rebuild');
    formData.set('scopeTraceIds', 'trace-1,trace-2');
    formData.set('scopeDateFrom', '2026-02-20');
    formData.set('scopeDateTo', '2026-02-25');

    const result = await runArtifactGovernanceAdminAction(formData);

    expect(result).toEqual({
      ok: true,
      data: {
        operation: 'rebuild',
        traceId: 'trace-1',
        artifactType: 'payout_statement',
        artifactVersion: 2,
        versionId: 'version-2',
        deliveryId: 'delivery-2',
        rateLimitRemaining: null,
        rateLimitResetAtIso: null,
      },
    });
    expect(mockGetRequestContext).toHaveBeenCalledWith(expect.any(Headers));
    expect(mockRebuildArtifactForTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'trace-1',
        artifactType: 'payout_statement',
        reasonCode: 'manual_rebuild',
        actorUserId: 'staff-user-1',
        scope: {
          traceIds: ['trace-1', 'trace-2'],
          dateFrom: '2026-02-20',
          dateTo: '2026-02-25',
        },
      }),
    );
  });

  it('runs resend governance operation and returns rate-limit metadata', async () => {
    const resetAt = new Date('2026-02-26T12:00:00.000Z');
    mockResendArtifactForTrace.mockResolvedValue({
      delivery: {
        id: 'delivery-3',
        artifactVersionId: 'version-2',
        traceId: 'trace-1',
        artifactType: 'payout_statement',
        channel: 'support_portal',
        recipientReference: 'support:trace-1',
        reasonCode: 'manual_resend',
        requestedByUserId: 'staff-user-1',
        createdAt: new Date('2026-02-25T12:00:00.000Z'),
      },
      rateLimit: {
        remaining: 3,
        resetAt,
      },
    });

    const result = await runArtifactGovernanceAdminAction({
      operation: 'resend',
      traceId: 'trace-1',
      artifactType: 'payout_statement',
      artifactVersion: 2,
      reasonCode: 'manual_resend',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        operation: 'resend',
        traceId: 'trace-1',
        artifactType: 'payout_statement',
        artifactVersion: 2,
        versionId: 'version-2',
        deliveryId: 'delivery-3',
        rateLimitRemaining: 3,
        rateLimitResetAtIso: resetAt.toISOString(),
      },
    });
    expect(mockResendArtifactForTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'trace-1',
        artifactType: 'payout_statement',
        reasonCode: 'manual_resend',
        artifactVersion: 2,
      }),
    );
  });

  it('returns governance domain errors with explicit code and message', async () => {
    mockRebuildArtifactForTrace.mockRejectedValueOnce(
      new MockArtifactGovernanceError(
        'ARTIFACT_SCOPE_SINGLETON_REQUIRED',
        'Governance operations are singleton-only in v1.',
      ),
    );

    const result = await runArtifactGovernanceAdminAction({
      operation: 'rebuild',
      traceId: 'trace-1',
      artifactType: 'payout_statement',
      reasonCode: 'manual_rebuild',
    });

    expect(result).toEqual({
      ok: false,
      error: 'ARTIFACT_SCOPE_SINGLETON_REQUIRED',
      message: 'Governance operations are singleton-only in v1.',
    });
  });

  it('returns SERVER_ERROR when governance service throws unknown error', async () => {
    mockResendArtifactForTrace.mockRejectedValueOnce(new Error('unexpected failure'));

    const result = await runArtifactGovernanceAdminAction({
      operation: 'resend',
      traceId: 'trace-1',
      artifactType: 'payout_statement',
      reasonCode: 'manual_resend',
    });

    expect(result).toEqual({
      ok: false,
      error: 'SERVER_ERROR',
      message: 'SERVER_ERROR',
    });
  });

  it('lists governance summary and handles failures', async () => {
    mockGetArtifactGovernanceSummary.mockResolvedValueOnce({
      versions: [
        {
          id: 'version-1',
          traceId: 'trace-1',
          artifactType: 'payout_statement',
          artifactVersion: 1,
          fingerprint: 'fingerprint-v1',
          rebuiltFromVersionId: null,
          reasonCode: 'initial',
          requestedByUserId: 'staff-user-1',
          createdAt: new Date('2026-02-25T12:00:00.000Z'),
        },
      ],
      deliveries: [
        {
          id: 'delivery-1',
          artifactVersionId: 'version-1',
          traceId: 'trace-1',
          artifactType: 'payout_statement',
          channel: 'support_portal',
          recipientReference: 'support:trace-1',
          reasonCode: 'initial',
          requestedByUserId: 'staff-user-1',
          createdAt: new Date('2026-02-25T12:01:00.000Z'),
        },
      ],
    });

    const success = await listArtifactGovernanceSummaryAdminAction();
    expect(success).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          versions: expect.any(Array),
          deliveries: expect.any(Array),
        }),
      }),
    );

    mockGetArtifactGovernanceSummary.mockRejectedValueOnce(new Error('summary unavailable'));
    const failure = await listArtifactGovernanceSummaryAdminAction();

    expect(failure).toEqual({
      ok: false,
      error: 'SERVER_ERROR',
      message: 'SERVER_ERROR',
    });
  });
});
