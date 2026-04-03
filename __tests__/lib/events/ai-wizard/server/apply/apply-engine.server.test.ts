const mockValidateReferencedDistanceIds = jest.fn();
const mockPreflightPatch = jest.fn();
const mockInitializePolicyState = jest.fn();
const mockExecuteApplyOp = jest.fn();
const mockRecordApplyOpAudit = jest.fn();
const mockRecordApplySuccessAudit = jest.fn();
const mockClaimApplyReplay = jest.fn();
const mockDbTransaction = jest.fn();
const mockEventEditionsFindFirst = jest.fn();
const mockSafeRevalidateTag = jest.fn();

jest.mock('@/db', () => ({
  db: {
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
    query: {
      eventEditions: {
        findFirst: (...args: unknown[]) => mockEventEditionsFindFirst(...args),
      },
    },
  },
}));

jest.mock('@/lib/next-cache', () => ({
  safeRevalidateTag: (...args: unknown[]) => mockSafeRevalidateTag(...args),
}));

jest.mock('@/lib/events/ai-wizard/server/apply/preflight', () => ({
  validateReferencedDistanceIds: (...args: unknown[]) => mockValidateReferencedDistanceIds(...args),
  preflightPatch: (...args: unknown[]) => mockPreflightPatch(...args),
  initializePolicyState: (...args: unknown[]) => mockInitializePolicyState(...args),
}));

jest.mock('@/lib/events/ai-wizard/server/apply/execute-op', () => ({
  executeApplyOp: (...args: unknown[]) => mockExecuteApplyOp(...args),
}));

jest.mock('@/lib/events/ai-wizard/server/apply/audit', () => ({
  recordApplyOpAudit: (...args: unknown[]) => mockRecordApplyOpAudit(...args),
  recordApplySuccessAudit: (...args: unknown[]) => mockRecordApplySuccessAudit(...args),
}));

jest.mock('@/lib/events/ai-wizard/server/apply/replay-store', () => ({
  claimApplyReplay: (...args: unknown[]) => mockClaimApplyReplay(...args),
}));

import { applyAiWizardPatch } from '@/lib/events/ai-wizard/server/apply/apply-engine';

const transactionClient = {
  query: {
    eventEditions: {
      findFirst: jest.fn(),
    },
  },
};

const baseInput = {
  editionId: '11111111-1111-4111-8111-111111111111',
  locale: 'es',
  actorUserId: 'user-1',
  organizationId: 'org-1',
  event: {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'trail-2026',
    timezone: 'America/Mexico_City',
    seriesId: 'series-1',
    policyConfig: null,
  },
  patch: {
    title: 'Actualizar FAQ y políticas',
    summary: 'Dos cambios ordenados',
    ops: [
      {
        type: 'create_faq_item',
        editionId: '11111111-1111-4111-8111-111111111111',
        data: {
          question: '¿Qué incluye?',
          answerMarkdown: 'Incluye cronometraje.',
        },
      },
      {
        type: 'append_policy_markdown',
        editionId: '11111111-1111-4111-8111-111111111111',
        data: {
          policy: 'refund',
          markdown: 'No hay devoluciones',
        },
      },
    ],
    markdownOutputs: [
      { domain: 'faq', contentMarkdown: 'Incluye cronometraje.' },
      { domain: 'policy', contentMarkdown: 'No hay devoluciones' },
    ],
  },
  core: {
    title: 'Actualizar FAQ y políticas',
    summary: 'Dos cambios ordenados',
    ops: [
      {
        type: 'create_faq_item',
        editionId: '11111111-1111-4111-8111-111111111111',
        data: {
          question: '¿Qué incluye?',
          answerMarkdown: 'Incluye cronometraje.',
        },
      },
      {
        type: 'append_policy_markdown',
        editionId: '11111111-1111-4111-8111-111111111111',
        data: {
          policy: 'refund',
          markdown: 'No hay devoluciones',
        },
      },
    ],
    markdownOutputs: [
      { domain: 'faq', contentMarkdown: 'Incluye cronometraje.' },
      { domain: 'policy', contentMarkdown: 'No hay devoluciones' },
    ],
  },
  proposalId: undefined,
  proposalFingerprint: 'fingerprint-1',
  idempotencyKey: undefined,
  replayKey: 'replay-key-1',
  replayKeyKind: 'synthetic',
  syntheticReplayKey: 'replay-key-1',
  requestContext: {},
} as const;

describe('applyAiWizardPatch', () => {
  const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    mockValidateReferencedDistanceIds.mockReset();
    mockPreflightPatch.mockReset();
    mockInitializePolicyState.mockReset();
    mockExecuteApplyOp.mockReset();
    mockRecordApplyOpAudit.mockReset();
    mockRecordApplySuccessAudit.mockReset();
    mockClaimApplyReplay.mockReset();
    mockDbTransaction.mockReset();
    mockEventEditionsFindFirst.mockReset();
    mockSafeRevalidateTag.mockReset();

    mockValidateReferencedDistanceIds.mockResolvedValue(null);
    mockPreflightPatch.mockResolvedValue(null);
    mockInitializePolicyState.mockReturnValue({ refundsAllowed: false });
    mockRecordApplyOpAudit.mockResolvedValue({ ok: true, auditLogId: 'audit-1' });
    mockRecordApplySuccessAudit.mockResolvedValue({ ok: true, auditLogId: 'apply-audit-1' });
    mockClaimApplyReplay.mockResolvedValue({ status: 'claimed' });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
    );
    mockEventEditionsFindFirst.mockResolvedValue({
      slug: 'trail-2026',
      series: { slug: 'series-2026' },
    });
  });

  afterAll(() => {
    consoleWarnSpy.mockRestore();
  });

  it('returns referenced-distance failures before execution starts', async () => {
    mockValidateReferencedDistanceIds.mockResolvedValue({
      code: 'INVALID_DISTANCE',
      details: { distanceId: 'distance-missing' },
    });

    const result = await applyAiWizardPatch(baseInput as never);

    expect(result).toEqual({
      ok: false,
      outcome: 'rejected',
      code: 'INVALID_DISTANCE',
      retryable: false,
      details: { distanceId: 'distance-missing' },
      applied: [],
      proposalId: undefined,
      proposalFingerprint: 'fingerprint-1',
    });
    expect(mockExecuteApplyOp).not.toHaveBeenCalled();
  });

  it('stops on the first failed op and returns prior applied results', async () => {
    mockExecuteApplyOp
      .mockResolvedValueOnce({
        ok: true,
        appliedOp: {
          opIndex: 0,
          type: 'create_faq_item',
          status: 'applied',
          result: { id: 'faq-1' },
        },
        policyState: { refundsAllowed: false },
      })
      .mockResolvedValueOnce({
        ok: false,
        code: 'RETRY_LATER',
        retryable: true,
        details: { opIndex: 1, operation: 'append_policy_markdown' },
      });

    const result = await applyAiWizardPatch(baseInput as never);

    expect(result).toEqual({
      ok: false,
      outcome: 'rejected',
      code: 'RETRY_LATER',
      retryable: true,
      failedOpIndex: 1,
      details: { opIndex: 1, operation: 'append_policy_markdown' },
      applied: [
        {
          opIndex: 0,
          type: 'create_faq_item',
          status: 'applied',
          result: { id: 'faq-1' },
          auditLogId: 'audit-1',
        },
      ],
      proposalId: undefined,
      proposalFingerprint: 'fingerprint-1',
    });
    expect(mockExecuteApplyOp).toHaveBeenCalledTimes(2);
  });

  it('keeps the apply result successful when the non-transactional audit journal fails', async () => {
    mockExecuteApplyOp.mockResolvedValueOnce({
      ok: true,
      appliedOp: {
        opIndex: 0,
        type: 'create_faq_item',
        status: 'applied',
        result: { id: 'faq-1' },
      },
      policyState: { refundsAllowed: false },
    });
    mockRecordApplyOpAudit.mockResolvedValueOnce({ ok: false, error: 'audit failed' });

    const result = await applyAiWizardPatch({
      ...baseInput,
      patch: {
        ...baseInput.patch,
        ops: [baseInput.patch.ops[0]],
        markdownOutputs: [baseInput.patch.markdownOutputs[0]],
      },
      core: {
        ...baseInput.core,
        ops: [baseInput.core.ops[0]],
        markdownOutputs: [baseInput.core.markdownOutputs[0]],
      },
    } as never);

    expect(result).toEqual({
      ok: true,
      outcome: 'applied',
      applied: [
        {
          opIndex: 0,
          type: 'create_faq_item',
          status: 'applied',
          result: { id: 'faq-1' },
        },
      ],
      proposalId: undefined,
      proposalFingerprint: 'fingerprint-1',
    });
    expect(mockRecordApplySuccessAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ replayKey: 'replay-key-1' }),
        applied: [expect.objectContaining({ opIndex: 0, type: 'create_faq_item' })],
      }),
    );
  });

  it('skips the generic apply audit journal for create_add_on ops', async () => {
    mockExecuteApplyOp.mockResolvedValueOnce({
      ok: true,
      appliedOp: {
        opIndex: 0,
        type: 'create_add_on',
        status: 'applied',
        result: {
          addOn: { id: 'add-on-1' },
          option: { id: 'option-1' },
        },
      },
      policyState: { refundsAllowed: false },
    });

    const result = await applyAiWizardPatch({
      ...baseInput,
      patch: {
        ...baseInput.patch,
        ops: [
          {
            type: 'create_add_on',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: {
              title: 'Playera',
              optionPrice: 250,
            },
          },
        ],
        markdownOutputs: [],
      },
      core: {
        ...baseInput.core,
        ops: [
          {
            type: 'create_add_on',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: {
              title: 'Playera',
              optionPrice: 250,
            },
          },
        ],
        markdownOutputs: [],
      },
    } as never);

    expect(result).toEqual({
      ok: true,
      outcome: 'applied',
      applied: [
        {
          opIndex: 0,
          type: 'create_add_on',
          status: 'applied',
          result: {
            addOn: { id: 'add-on-1' },
            option: { id: 'option-1' },
          },
        },
      ],
      proposalId: undefined,
      proposalFingerprint: 'fingerprint-1',
    });
    expect(mockRecordApplyOpAudit).not.toHaveBeenCalled();
    expect(mockRecordApplySuccessAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        applied: [expect.objectContaining({ type: 'create_add_on' })],
      }),
    );
  });

  it('returns duplicate success without executing ops when the replay key is already claimed', async () => {
    mockClaimApplyReplay.mockResolvedValueOnce({ status: 'duplicate' });

    const result = await applyAiWizardPatch(baseInput as never);

    expect(result).toEqual({
      ok: true,
      outcome: 'duplicate',
      duplicate: true,
      applied: [],
      proposalId: undefined,
      proposalFingerprint: 'fingerprint-1',
    });
    expect(mockExecuteApplyOp).not.toHaveBeenCalled();
    expect(mockRecordApplyOpAudit).not.toHaveBeenCalled();
    expect(mockRecordApplySuccessAudit).not.toHaveBeenCalled();
    expect(mockSafeRevalidateTag).not.toHaveBeenCalled();
  });

  it('does not short-circuit a retry after partial failure when no replay duplicate is detected', async () => {
    mockExecuteApplyOp
      .mockResolvedValueOnce({
        ok: true,
        appliedOp: {
          opIndex: 0,
          type: 'create_faq_item',
          status: 'applied',
          result: { id: 'faq-1' },
        },
        policyState: { refundsAllowed: false },
      })
      .mockResolvedValueOnce({
        ok: false,
        code: 'RETRY_LATER',
        retryable: true,
        details: { opIndex: 1, operation: 'append_policy_markdown' },
      });

    const result = await applyAiWizardPatch(baseInput as never);

    expect(result.ok).toBe(false);
    expect(mockClaimApplyReplay).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ replayKey: 'replay-key-1' }) }),
    );
    expect(mockRecordApplySuccessAudit).not.toHaveBeenCalled();
    expect(mockSafeRevalidateTag).not.toHaveBeenCalled();
  });

  it('returns a retryable rejection when an unexpected op error occurs after earlier applied ops', async () => {
    mockExecuteApplyOp
      .mockResolvedValueOnce({
        ok: true,
        appliedOp: { opIndex: 0, type: 'create_faq_item', status: 'applied', result: { id: 'faq-1' } },
        policyState: {
          refundsAllowed: false,
          refundPolicyText: null,
          refundDeadline: null,
          transfersAllowed: false,
          transferPolicyText: null,
          transferDeadline: null,
          deferralsAllowed: false,
          deferralPolicyText: null,
          deferralDeadline: null,
        },
      })
      .mockRejectedValueOnce(new Error('boom'));

    const result = await applyAiWizardPatch({
      ...baseInput,
      patch: {
        ...baseInput.patch,
        ops: [
          baseInput.patch.ops[0],
          {
            type: 'create_waiver',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: { title: 'Waiver', bodyMarkdown: 'Body' },
          },
        ],
      },
      core: {
        ...baseInput.core,
        ops: [
          baseInput.core.ops[0],
          {
            type: 'create_waiver',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: { title: 'Waiver', bodyMarkdown: 'Body' },
          },
        ],
      },
    } as never);

    expect(result).toEqual({
      ok: false,
      outcome: 'rejected',
      code: 'RETRY_LATER',
      retryable: true,
      failedOpIndex: 1,
      details: {
        opIndex: 1,
        operation: 'create_waiver',
        reason: 'UNEXPECTED_APPLY_ERROR',
        message: 'boom',
      },
      applied: [
        {
          opIndex: 0,
          type: 'create_faq_item',
          status: 'applied',
          result: { id: 'faq-1' },
          auditLogId: 'audit-1',
        },
      ],
      proposalFingerprint: 'fingerprint-1',
      proposalId: undefined,
    });
    expect(mockRecordApplySuccessAudit).not.toHaveBeenCalled();
    expect(mockSafeRevalidateTag).not.toHaveBeenCalled();
  });

  it('rejects explicit idempotency key reuse when the stored fingerprint belongs to a different patch', async () => {
    mockClaimApplyReplay.mockResolvedValueOnce({
      status: 'conflict',
      existingProposalFingerprint: 'fingerprint-existing',
      existingProposalId: 'proposal-existing',
    });

    const result = await applyAiWizardPatch({
      ...baseInput,
      idempotencyKey: 'idem-123',
      replayKeyKind: 'explicit',
    } as never);

    expect(result).toEqual({
      ok: false,
      outcome: 'rejected',
      code: 'IDEMPOTENCY_KEY_REUSED',
      retryable: false,
      details: {
        reason: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PATCH',
        existingProposalFingerprint: 'fingerprint-existing',
        existingProposalId: 'proposal-existing',
      },
      applied: [],
      proposalId: undefined,
      proposalFingerprint: 'fingerprint-1',
    });
    expect(mockExecuteApplyOp).not.toHaveBeenCalled();
    expect(mockSafeRevalidateTag).not.toHaveBeenCalled();
  });

  it('revalidates protected and public cache tags after a successful slug-changing apply', async () => {
    mockExecuteApplyOp.mockResolvedValueOnce({
      ok: true,
      appliedOp: {
        opIndex: 0,
        type: 'update_edition',
        status: 'applied',
      },
      policyState: { refundsAllowed: false },
    });
    mockEventEditionsFindFirst.mockResolvedValueOnce({
      slug: 'trail-2027',
      series: { slug: 'series-2026' },
    });

    const result = await applyAiWizardPatch({
      ...baseInput,
      event: {
        ...baseInput.event,
        seriesSlug: 'series-2026',
      },
      patch: {
        ...baseInput.patch,
        ops: [
          {
            type: 'update_edition',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: { slug: 'trail-2027' },
          },
        ],
        markdownOutputs: [],
      },
      core: {
        ...baseInput.core,
        ops: [
          {
            type: 'update_edition',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: { slug: 'trail-2027' },
          },
        ],
        markdownOutputs: [],
      },
    } as never);

    expect(result).toEqual({
      ok: true,
      outcome: 'applied',
      applied: [
        {
          opIndex: 0,
          type: 'update_edition',
          status: 'applied',
          auditLogId: 'audit-1',
        },
      ],
      proposalId: undefined,
      proposalFingerprint: 'fingerprint-1',
    });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('event-edition:11111111-1111-4111-8111-111111111111:detail', { expire: 0 });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('event-edition:11111111-1111-4111-8111-111111111111:pricing', { expire: 0 });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('event-edition:11111111-1111-4111-8111-111111111111:website', { expire: 0 });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('event-edition:11111111-1111-4111-8111-111111111111:questions', { expire: 0 });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('event-edition:11111111-1111-4111-8111-111111111111:add-ons', { expire: 0 });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('public-event:series-2026:trail-2026', { expire: 0 });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith('public-event:series-2026:trail-2027', { expire: 0 });
  });
});
