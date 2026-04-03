import { db } from '@/db';
import {
  eventEditionAddOnsTag,
  eventEditionDetailTag,
  eventEditionPricingTag,
  eventEditionQuestionsTag,
  eventEditionWebsiteTag,
  publicEventBySlugTag,
} from '@/lib/events/cache-tags';
import { safeRevalidateTag } from '@/lib/next-cache';

import { recordApplyOpAudit, recordApplySuccessAudit } from './audit';
import { executeApplyOp } from './execute-op';
import { initializePolicyState, preflightPatch, validateReferencedDistanceIds } from './preflight';
import { claimApplyReplay } from './replay-store';
import type {
  EventAiWizardAppliedOpResult,
  EventAiWizardApplyFailure,
  EventAiWizardApplyEngineInput,
  EventAiWizardApplyEngineResult,
} from './types';

function revalidateApplyCaches(editionId: string) {
  safeRevalidateTag(eventEditionDetailTag(editionId), { expire: 0 });
  safeRevalidateTag(eventEditionPricingTag(editionId), { expire: 0 });
  safeRevalidateTag(eventEditionWebsiteTag(editionId), { expire: 0 });
  safeRevalidateTag(eventEditionQuestionsTag(editionId), { expire: 0 });
  safeRevalidateTag(eventEditionAddOnsTag(editionId), { expire: 0 });
}

async function revalidatePublicApplyCache(editionId: string) {
  const edition = await db.query.eventEditions.findFirst({
    where: (table, { eq, isNull, and }) =>
      and(eq(table.id, editionId), isNull(table.deletedAt)),
    columns: { slug: true },
    with: {
      series: {
        columns: { slug: true },
      },
    },
  });

  if (!edition?.series?.slug) {
    return;
  }

  safeRevalidateTag(publicEventBySlugTag(edition.series.slug, edition.slug), { expire: 0 });
}

function revalidatePreviousPublicEventSlugTag(input: EventAiWizardApplyEngineInput) {
  for (const op of input.patch.ops) {
    if (op.type !== 'update_edition') {
      continue;
    }

    const previousEditionSlug = input.event.slug;
    const nextEditionSlug = op.data.slug;

    if (!nextEditionSlug || nextEditionSlug === previousEditionSlug) {
      continue;
    }

    safeRevalidateTag(publicEventBySlugTag(input.event.seriesSlug, previousEditionSlug), {
      expire: 0,
    });
    return;
  }
}

class ApplyRollbackError extends Error {
  constructor(public readonly result: EventAiWizardApplyFailure) {
    super('AI_WIZARD_APPLY_ROLLBACK');
  }
}

export async function applyAiWizardPatch(
  input: EventAiWizardApplyEngineInput,
): Promise<EventAiWizardApplyEngineResult> {
  const distanceFailure = await validateReferencedDistanceIds({
    editionId: input.editionId,
    patch: input.patch,
  });

  if (distanceFailure) {
    return {
      ok: false,
      outcome: 'rejected',
      code: distanceFailure.code,
      retryable: false,
      details: distanceFailure.details,
      applied: [],
      proposalFingerprint: input.proposalFingerprint,
      proposalId: input.proposalId,
    };
  }

  const preflightFailure = await preflightPatch({
    editionId: input.editionId,
    patch: input.patch,
    event: input.event,
  });

  if (preflightFailure) {
    return {
      ok: false,
      outcome: 'rejected',
      code: preflightFailure.code,
      retryable: false,
      details: preflightFailure.details,
      applied: [],
      proposalFingerprint: input.proposalFingerprint,
      proposalId: input.proposalId,
    };
  }

  let txResult: EventAiWizardApplyEngineResult;

  try {
    txResult = await db.transaction(async (tx) => {
      const replayClaim = await claimApplyReplay({ input, tx });

      if (replayClaim.status === 'conflict') {
        return {
          ok: false,
          outcome: 'rejected',
          code: 'IDEMPOTENCY_KEY_REUSED',
          retryable: false,
          details: {
            reason: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PATCH',
            existingProposalFingerprint: replayClaim.existingProposalFingerprint,
            existingProposalId: replayClaim.existingProposalId,
          },
          applied: [],
          proposalFingerprint: input.proposalFingerprint,
          proposalId: input.proposalId,
        };
      }

      if (replayClaim.status === 'duplicate') {
        return {
          ok: true,
          outcome: 'duplicate',
          duplicate: true,
          applied: [],
          proposalFingerprint: input.proposalFingerprint,
          proposalId: input.proposalId,
        };
      }

      const applied: EventAiWizardAppliedOpResult[] = [];
      let policyState = initializePolicyState(input.event);

      for (let opIndex = 0; opIndex < input.patch.ops.length; opIndex += 1) {
        const opResult = await executeApplyOp({ input, opIndex, policyState, tx });

        if (!opResult.ok) {
          throw new ApplyRollbackError({
            ok: false,
            outcome: 'rejected',
            code: opResult.code,
            retryable: opResult.retryable,
            failedOpIndex: opIndex,
            details: opResult.details,
            applied,
            proposalFingerprint: input.proposalFingerprint,
            proposalId: input.proposalId,
          });
        }

        const appliedOp = { ...opResult.appliedOp };
        applied.push(appliedOp);

        if (appliedOp.type !== 'create_add_on') {
          const auditResult = await recordApplyOpAudit({
            input,
            appliedOp,
            tx,
          });

          if (!auditResult.ok) {
            console.warn('[ai-wizard][apply] failed to record apply-op audit journal', {
              editionId: input.editionId,
              proposalFingerprint: input.proposalFingerprint,
              opIndex,
              opType: appliedOp.type,
              error: auditResult.error,
            });
          } else if (auditResult.auditLogId) {
            appliedOp.auditLogId = auditResult.auditLogId;
          }
        }

        policyState = opResult.policyState;
      }

      const completionAudit = await recordApplySuccessAudit({ input, applied, tx });
      if (!completionAudit.ok) {
        console.warn('[ai-wizard][apply] failed to record apply-success audit', {
          editionId: input.editionId,
          proposalFingerprint: input.proposalFingerprint,
          replayKey: input.replayKey,
          error: completionAudit.error,
        });
      }

      return {
        ok: true,
        outcome: 'applied',
        applied,
        proposalFingerprint: input.proposalFingerprint,
        proposalId: input.proposalId,
      };
    });
  } catch (error) {
    if (error instanceof ApplyRollbackError) {
      return error.result;
    }

    throw error;
  }

  if (txResult.ok && txResult.outcome === 'applied') {
    revalidateApplyCaches(input.editionId);
    revalidatePreviousPublicEventSlugTag(input);
    await revalidatePublicApplyCache(input.editionId);
  }

  return txResult;
}
