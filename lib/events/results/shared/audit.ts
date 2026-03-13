import { createAuditLog, type CreateAuditLogResult } from '@/lib/audit';
import type { ResultVersionFinalizationGateSummary } from '@/lib/events/results/types';

export type CorrectionDeniedAuditAction =
  | 'results.correction.request.denied'
  | 'results.correction.review.denied';

export function throwIfAuditLogFailed(
  result: CreateAuditLogResult,
  context: string,
): void {
  if (result.ok) return;
  throw new Error(`AUDIT_LOG_FAILED:${context}`);
}

export async function createResultsIngestionInitializeAudit(
  params: {
    organizationId: string | null;
    actorUserId: string;
    entityId: string;
    editionId: string;
    resultVersionId: string;
    sourceLane: string;
    sourceReference: string | null;
    sourceFileChecksum: string | null;
    startedAtIso: string;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any,
): Promise<CreateAuditLogResult> {
  return createAuditLog(
    {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: 'results.ingestion.initialize',
      entityType: 'result_ingestion_session',
      entityId: params.entityId,
      after: {
        editionId: params.editionId,
        resultVersionId: params.resultVersionId,
        sourceLane: params.sourceLane,
        sourceReference: params.sourceReference,
        sourceFileChecksum: params.sourceFileChecksum,
        startedAt: params.startedAtIso,
      },
    },
    tx,
  );
}

export async function createResultsFinalizationAudit(params: {
  organizationId: string | null;
  actorUserId: string;
  entityId: string;
  editionId: string;
  previousStatus: string;
  previousVersionNumber: number;
  nextStatus: string;
  nextVersionNumber: number;
  finalizedAtIso: string | null;
  finalizedByUserId: string | null;
  gate: ResultVersionFinalizationGateSummary;
  attestationNote: string | null;
}): Promise<CreateAuditLogResult> {
  return createAuditLog({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: 'results.version.finalize',
    entityType: 'result_version',
    entityId: params.entityId,
    before: {
      editionId: params.editionId,
      status: params.previousStatus,
      versionNumber: params.previousVersionNumber,
    },
    after: {
      editionId: params.editionId,
      status: params.nextStatus,
      versionNumber: params.nextVersionNumber,
      finalizedAt: params.finalizedAtIso,
      finalizedByUserId: params.finalizedByUserId,
      gate: params.gate,
      attestationNote: params.attestationNote,
    },
  });
}

export async function createResultsCorrectionApprovalAudit(params: {
  organizationId: string | null;
  actorUserId: string;
  entityId: string;
  editionId: string;
  status: string;
  sourceResultVersionId: string;
  reviewedAtIso: string | null;
  reviewedByUserId: string | null;
}): Promise<CreateAuditLogResult> {
  return createAuditLog({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: 'results.correction.review.approve',
    entityType: 'result_correction_request',
    entityId: params.entityId,
    before: {
      editionId: params.editionId,
      status: 'pending',
    },
    after: {
      editionId: params.editionId,
      status: params.status,
      sourceResultVersionId: params.sourceResultVersionId,
      reviewedAt: params.reviewedAtIso,
      reviewedByUserId: params.reviewedByUserId,
    },
  });
}

export async function createResultsCorrectionPublishAudit(
  params: {
    organizationId: string | null;
    actorUserId: string;
    entityId: string;
    editionId: string;
    previousStatus: string;
    nextStatus: string;
    sourceResultVersionId: string;
    correctedResultVersionId: string;
    publishedByUserId: string;
    publishedAtIso: string;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any,
): Promise<CreateAuditLogResult> {
  return createAuditLog(
    {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: 'results.correction.publish',
      entityType: 'result_correction_request',
      entityId: params.entityId,
      before: {
        editionId: params.editionId,
        status: params.previousStatus,
        sourceResultVersionId: params.sourceResultVersionId,
      },
      after: {
        editionId: params.editionId,
        status: params.nextStatus,
        sourceResultVersionId: params.sourceResultVersionId,
        correctedResultVersionId: params.correctedResultVersionId,
        publishedByUserId: params.publishedByUserId,
        publishedAt: params.publishedAtIso,
      },
    },
    tx,
  );
}

export async function logCorrectionAuthorizationDenied(params: {
  action: CorrectionDeniedAuditAction;
  actorUserId: string;
  entityType: 'result_entry' | 'result_correction_request';
  entityId: string;
  organizationId: string | null;
  reason: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const auditResult = await createAuditLog({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    after: {
      outcome: 'denied',
      reason: params.reason,
      ...(params.details ?? {}),
    },
  });

  if (!auditResult.ok) {
    console.warn('[results-corrections] Failed to write authorization denied audit log', {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      reason: params.reason,
      error: auditResult.error,
    });
  }
}
