const mockValidateReferencedDistanceIds = jest.fn();
const mockPreflightPatch = jest.fn();
const mockInitializePolicyState = jest.fn();
const mockExecuteApplyOp = jest.fn();
const mockRecordApplyOpAudit = jest.fn();

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
}));

import { applyAiWizardPatch } from '@/lib/events/ai-wizard/server/apply/apply-engine';

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
  proposalFingerprint: 'fingerprint-1',
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

    mockValidateReferencedDistanceIds.mockResolvedValue(null);
    mockPreflightPatch.mockResolvedValue(null);
    mockInitializePolicyState.mockReturnValue({ refundsAllowed: false });
    mockRecordApplyOpAudit.mockResolvedValue({ ok: true, auditLogId: 'audit-1' });
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
      proposalFingerprint: 'fingerprint-1',
    });
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
      proposalFingerprint: 'fingerprint-1',
    });
    expect(mockRecordApplyOpAudit).not.toHaveBeenCalled();
  });
});
