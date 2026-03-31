import { recordApplyOpAudit } from './audit';
import { executeApplyOp } from './execute-op';
import { initializePolicyState, preflightPatch, validateReferencedDistanceIds } from './preflight';
import type {
  EventAiWizardAppliedOpResult,
  EventAiWizardApplyEngineInput,
  EventAiWizardApplyEngineResult,
} from './types';

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
    };
  }

  const applied: EventAiWizardAppliedOpResult[] = [];
  let policyState = initializePolicyState(input.event);

  for (let opIndex = 0; opIndex < input.patch.ops.length; opIndex += 1) {
    const opResult = await executeApplyOp({ input, opIndex, policyState });

    if (!opResult.ok) {
      return {
        ok: false,
        outcome: 'rejected',
        code: opResult.code,
        retryable: opResult.retryable,
        failedOpIndex: opIndex,
        details: opResult.details,
        applied,
        proposalFingerprint: input.proposalFingerprint,
      };
    }

    const appliedOp = { ...opResult.appliedOp };
    applied.push(appliedOp);

    if (appliedOp.type !== 'create_add_on') {
      const auditResult = await recordApplyOpAudit({
        input,
        appliedOp,
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

  return {
    ok: true,
    outcome: 'applied',
    applied,
    proposalFingerprint: input.proposalFingerprint,
  };
}
