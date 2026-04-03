import { eq } from 'drizzle-orm';

import { createAuditLog } from '@/lib/audit';
import { auditLogs } from '@/db/schema';
import type { AuditAction } from '@/lib/audit';
import type { EventAiWizardOp } from '@/lib/events/ai-wizard/schemas';

import { resolvePriceCents } from './preflight';
import type { ApplyTx } from './db-client';
import type { EventAiWizardApplyEngineInput, EventAiWizardAppliedOpResult } from './types';

function getResultId(result: unknown): string | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const value = result as Record<string, unknown>;
  if (typeof value.id === 'string') {
    return value.id;
  }
  if (value.addOn && typeof value.addOn === 'object' && value.addOn !== null) {
    const addOn = value.addOn as Record<string, unknown>;
    return typeof addOn.id === 'string' ? addOn.id : null;
  }

  return null;
}

function buildAuditTarget(params: {
  input: EventAiWizardApplyEngineInput;
  op: EventAiWizardOp;
  appliedOp: EventAiWizardAppliedOpResult;
}): {
  action: AuditAction;
  entityType: string;
  entityId: string;
  after: Record<string, unknown>;
} {
  const baseAfter = {
    aiWizardApply: {
      editionId: params.input.editionId,
      proposalId: params.input.proposalId ?? null,
      proposalFingerprint: params.input.proposalFingerprint,
      idempotencyKey: params.input.idempotencyKey ?? null,
      replayKey: params.input.replayKey,
      replayKeyKind: params.input.replayKeyKind,
      syntheticReplayKey: params.input.syntheticReplayKey,
      opIndex: params.appliedOp.opIndex,
      opType: params.op.type,
      status: params.appliedOp.status,
    },
  };

  switch (params.op.type) {
    case 'update_edition':
      return {
        action: 'event.update',
        entityType: 'event_edition',
        entityId: params.input.editionId,
        after: {
          ...baseAfter,
          fields: Object.keys(params.op.data).sort(),
        },
      };
    case 'create_distance':
      return {
        action: 'distance.create',
        entityType: 'event_distance',
        entityId: getResultId(params.appliedOp.result) ?? params.input.editionId,
        after: {
          ...baseAfter,
          label: params.op.data.label,
          distanceValue: params.op.data.distanceValue ?? null,
          priceCents: resolvePriceCents(params.op.data),
        },
      };
    case 'update_distance_price':
      return {
        action: 'distance.update_price',
        entityType: 'event_distance',
        entityId: params.op.distanceId,
        after: {
          ...baseAfter,
          distanceId: params.op.distanceId,
          priceCents: resolvePriceCents(params.op.data),
        },
      };
    case 'create_pricing_tier':
      return {
        action: 'pricing.create',
        entityType: 'pricing_tier',
        entityId: getResultId(params.appliedOp.result) ?? params.op.distanceId,
        after: {
          ...baseAfter,
          distanceId: params.op.distanceId,
          label: params.op.data.label ?? null,
          priceCents: resolvePriceCents(params.op.data),
        },
      };
    case 'create_faq_item':
      return {
        action: 'faq.create',
        entityType: 'event_faq_item',
        entityId: getResultId(params.appliedOp.result) ?? params.input.editionId,
        after: {
          ...baseAfter,
          question: params.op.data.question,
        },
      };
    case 'create_waiver':
      return {
        action: 'waiver.create',
        entityType: 'waiver',
        entityId: getResultId(params.appliedOp.result) ?? params.input.editionId,
        after: {
          ...baseAfter,
          title: params.op.data.title,
        },
      };
    case 'create_question':
      return {
        action: 'registration_question.create',
        entityType: 'registration_question',
        entityId: getResultId(params.appliedOp.result) ?? params.input.editionId,
        after: {
          ...baseAfter,
          prompt: params.op.data.prompt,
          distanceId: params.op.data.distanceId ?? null,
        },
      };
    case 'create_add_on': {
      const addOnResult = (params.appliedOp.result ?? null) as {
        addOn?: { id?: string };
        option?: { id?: string };
      } | null;

      return {
        action: 'add_on.create',
        entityType: 'add_on',
        entityId: addOnResult?.addOn?.id ?? params.input.editionId,
        after: {
          ...baseAfter,
          title: params.op.data.title,
          distanceId: params.op.data.distanceId ?? null,
          optionId: addOnResult?.option?.id ?? null,
        },
      };
    }
    case 'append_website_section_markdown': {
      const contentId =
        params.appliedOp.result && typeof params.appliedOp.result === 'object'
          ? ((params.appliedOp.result as Record<string, unknown>).contentId as string | undefined)
          : undefined;
      return {
        action: 'website.update',
        entityType: 'event_website_content',
        entityId: contentId ?? params.input.editionId,
        after: {
          ...baseAfter,
          section: params.op.data.section,
          locale: params.op.data.locale ?? params.input.locale ?? 'es',
        },
      };
    }
    case 'append_policy_markdown':
      return {
        action: 'policy.update',
        entityType: 'event_edition',
        entityId: params.input.editionId,
        after: {
          ...baseAfter,
          policy: params.op.data.policy,
        },
      };
    case 'update_policy_config':
      return {
        action: 'policy.update',
        entityType: 'event_edition',
        entityId: params.input.editionId,
        after: {
          ...baseAfter,
          fields: Object.keys(params.op.data).sort(),
        },
      };
  }
}

export async function recordApplyOpAudit(params: {
  input: EventAiWizardApplyEngineInput;
  appliedOp: EventAiWizardAppliedOpResult;
  tx: ApplyTx;
}): Promise<{ ok: true; auditLogId?: string } | { ok: false; error: string }> {
  const op = params.input.patch.ops[params.appliedOp.opIndex];
  const auditTarget = buildAuditTarget({
    input: params.input,
    op,
    appliedOp: params.appliedOp,
  });

  const auditResult = await createAuditLog(
    {
      organizationId: params.input.organizationId,
      actorUserId: params.input.actorUserId,
      action: auditTarget.action,
      entityType: auditTarget.entityType,
      entityId: auditTarget.entityId,
      after: auditTarget.after,
      request: params.input.requestContext,
    },
    params.tx,
  );

  if (!auditResult.ok) {
    return { ok: false, error: auditResult.error ?? 'AI_WIZARD_APPLY_AUDIT_FAILED' };
  }

  return { ok: true, auditLogId: auditResult.auditLogId };
}

export async function recordApplySuccessAudit(params: {
  input: EventAiWizardApplyEngineInput;
  applied: EventAiWizardAppliedOpResult[];
  tx: ApplyTx;
}): Promise<{ ok: true; auditLogId?: string } | { ok: false; error: string }> {
  const auditResult = await createAuditLog(
    {
      organizationId: params.input.organizationId,
      actorUserId: params.input.actorUserId,
      action: 'event_ai_wizard.apply' as AuditAction,
      entityType: 'event_edition',
      entityId: params.input.editionId,
      after: {
        aiWizardApply: {
          editionId: params.input.editionId,
          proposalId: params.input.proposalId ?? null,
          proposalFingerprint: params.input.proposalFingerprint,
          idempotencyKey: params.input.idempotencyKey ?? null,
          replayKey: params.input.replayKey,
          replayKeyKind: params.input.replayKeyKind,
          syntheticReplayKey: params.input.syntheticReplayKey,
          status: 'completed',
          appliedCount: params.applied.length,
          opTypes: params.applied.map((entry) => entry.type),
        },
      },
      request: params.input.requestContext,
    },
    params.tx,
  );

  if (!auditResult.ok) {
    return { ok: false, error: auditResult.error ?? 'AI_WIZARD_APPLY_SUCCESS_AUDIT_FAILED' };
  }

  return { ok: true, auditLogId: auditResult.auditLogId };
}
