import {
  buildApplyReplayIdentity,
  buildApplyCoreFromPatch,
  buildExplicitReplayKey,
  buildSyntheticReplayKey,
  fingerprintApplyCore,
} from '@/lib/events/ai-wizard/server/apply/idempotency';
import type { EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';

function buildPatch(overrides?: Partial<EventAiWizardPatch>): EventAiWizardPatch {
  return {
    title: 'Actualizar contenido',
    summary: 'Resumen confiable',
    ops: [
      {
        type: 'create_faq_item',
        editionId: '11111111-1111-4111-8111-111111111111',
        data: {
          question: '¿Qué incluye?',
          answerMarkdown: 'Incluye cronometraje.',
        },
      },
    ],
    markdownOutputs: [{ domain: 'faq', contentMarkdown: 'Incluye cronometraje.' }],
    ...overrides,
  };
}

describe('ai wizard apply idempotency seam', () => {
  it('ignores server-owned patch meta when fingerprinting apply core', () => {
    const basePatch = buildPatch();
    const withServerMeta = buildPatch({
      missingFieldsChecklist: [
        { code: 'missing-date', stepId: 'basics', label: 'Falta fecha', severity: 'required' },
      ],
      intentRouting: [{ intent: 'faq', stepId: 'content', rationale: 'FAQ' }],
    });

    const baseFingerprint = fingerprintApplyCore(buildApplyCoreFromPatch(basePatch));
    const metaFingerprint = fingerprintApplyCore(buildApplyCoreFromPatch(withServerMeta));

    expect(metaFingerprint).toBe(baseFingerprint);
  });

  it('changes the fingerprint when the apply core changes', () => {
    const left = buildPatch();
    const right = buildPatch({
      ops: [
        {
          type: 'create_faq_item',
          editionId: '11111111-1111-4111-8111-111111111111',
          data: {
            question: '¿Qué incluye?',
            answerMarkdown: 'Incluye cronometraje y abastecimiento.',
          },
        },
      ],
      markdownOutputs: [
        { domain: 'faq', contentMarkdown: 'Incluye cronometraje y abastecimiento.' },
      ],
    });

    expect(fingerprintApplyCore(buildApplyCoreFromPatch(left))).not.toBe(
      fingerprintApplyCore(buildApplyCoreFromPatch(right)),
    );
  });

  it('builds a stable synthetic replay key from actor, edition, and fingerprint', () => {
    const fingerprint = fingerprintApplyCore(buildApplyCoreFromPatch(buildPatch()));

    expect(
      buildSyntheticReplayKey({
        actorUserId: 'user-1',
        editionId: 'edition-1',
        proposalFingerprint: fingerprint,
      }),
    ).toBe(
      buildSyntheticReplayKey({
        actorUserId: 'user-1',
        editionId: 'edition-1',
        proposalFingerprint: fingerprint,
      }),
    );
  });

  it('prefers an explicit idempotency key for replay identity while preserving the synthetic fallback', () => {
    const fingerprint = fingerprintApplyCore(buildApplyCoreFromPatch(buildPatch()));

    expect(
      buildApplyReplayIdentity({
        actorUserId: 'user-1',
        editionId: 'edition-1',
        proposalFingerprint: fingerprint,
        idempotencyKey: 'apply-123',
      }),
    ).toEqual({
      replayKey: buildExplicitReplayKey({
        actorUserId: 'user-1',
        editionId: 'edition-1',
        idempotencyKey: 'apply-123',
      }),
      replayKeyKind: 'explicit',
      syntheticReplayKey: buildSyntheticReplayKey({
        actorUserId: 'user-1',
        editionId: 'edition-1',
        proposalFingerprint: fingerprint,
      }),
    });
  });
});
