'server only';

import { createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  paymentArtifactDeliveries,
  paymentArtifactVersions,
  payoutRequests,
} from '@/db/schema';
import { createAuditLog } from '@/lib/audit';
import { safeCacheLife, safeCacheTag } from '@/lib/next-cache';
import { generatePayoutStatementArtifact } from '@/lib/payments/payouts/statements';
import { checkRateLimit, type RateLimitResult } from '@/lib/rate-limit';

export const artifactGovernanceSummaryTag = 'admin-payments-artifact-governance-summary';

export const supportedArtifactTypes = ['payout_statement'] as const;
export type SupportedArtifactType = (typeof supportedArtifactTypes)[number];

export const artifactGovernanceErrorCodes = [
  'ARTIFACT_TRACE_ID_REQUIRED',
  'ARTIFACT_REASON_REQUIRED',
  'ARTIFACT_SCOPE_SINGLETON_REQUIRED',
  'ARTIFACT_UNSUPPORTED_TYPE',
  'ARTIFACT_TRACE_NOT_FOUND',
  'ARTIFACT_VERSION_NOT_FOUND',
  'ARTIFACT_RESEND_RATE_LIMITED',
] as const;

export type ArtifactGovernanceErrorCode = (typeof artifactGovernanceErrorCodes)[number];

export class ArtifactGovernanceError extends Error {
  readonly code: ArtifactGovernanceErrorCode;
  readonly detail?: Record<string, unknown>;

  constructor(
    code: ArtifactGovernanceErrorCode,
    message: string,
    detail?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export type ArtifactVersionRecord = {
  id: string;
  traceId: string;
  artifactType: SupportedArtifactType;
  artifactVersion: number;
  fingerprint: string;
  rebuiltFromVersionId: string | null;
  reasonCode: string;
  requestedByUserId: string;
  createdAt: Date;
};

export type ArtifactDeliveryRecord = {
  id: string;
  artifactVersionId: string;
  traceId: string;
  artifactType: SupportedArtifactType;
  channel: string;
  recipientReference: string | null;
  reasonCode: string;
  requestedByUserId: string;
  createdAt: Date;
};

export type ArtifactGovernanceSummary = {
  versions: ArtifactVersionRecord[];
  deliveries: ArtifactDeliveryRecord[];
};

export type ArtifactRebuildResult = {
  version: ArtifactVersionRecord;
  delivery: ArtifactDeliveryRecord;
};

export type ArtifactResendResult = {
  delivery: ArtifactDeliveryRecord;
  rateLimit: {
    remaining: number;
    resetAt: Date;
  };
};

export type ArtifactGovernanceOperationScope = {
  traceIds?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
};

export type ArtifactVersionLineageInput = {
  id: string;
  artifactVersion: number;
};

export type ArtifactVersionLineage = {
  traceId: string;
  artifactType: SupportedArtifactType;
  artifactVersion: number;
  fingerprint: string;
  rebuiltFromVersionId: string | null;
};

function isSupportedArtifactType(value: string): value is SupportedArtifactType {
  return (supportedArtifactTypes as readonly string[]).includes(value);
}

function normalizeReasonCode(value: string): string {
  return value.trim();
}

function assertSupportedArtifactType(value: string): SupportedArtifactType {
  if (!isSupportedArtifactType(value)) {
    throw new ArtifactGovernanceError(
      'ARTIFACT_UNSUPPORTED_TYPE',
      `Unsupported artifact type: ${value}`,
      { artifactType: value },
    );
  }
  return value;
}

export function normalizeArtifactGovernanceTraceScope(params: {
  traceId: string;
  scope?: ArtifactGovernanceOperationScope;
}): string {
  const traceId = params.traceId.trim();
  if (!traceId) {
    throw new ArtifactGovernanceError(
      'ARTIFACT_TRACE_ID_REQUIRED',
      'Artifact governance operation requires a single traceId.',
    );
  }

  const hasBatchTraceScope = (params.scope?.traceIds?.length ?? 0) > 0;
  const hasDateRangeScope =
    Boolean(params.scope?.dateFrom?.trim()) || Boolean(params.scope?.dateTo?.trim());
  if (hasBatchTraceScope || hasDateRangeScope) {
    throw new ArtifactGovernanceError(
      'ARTIFACT_SCOPE_SINGLETON_REQUIRED',
      'Governance operations are singleton-only in v1 and must target a single traceId.',
      {
        hasBatchTraceScope,
        hasDateRangeScope,
      },
    );
  }

  return traceId;
}

export function normalizeArtifactGovernanceReason(value: string): string {
  const reasonCode = normalizeReasonCode(value);
  if (reasonCode.length < 3) {
    throw new ArtifactGovernanceError(
      'ARTIFACT_REASON_REQUIRED',
      'Reason code is required for artifact governance operations.',
    );
  }
  return reasonCode;
}

function toPayloadRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toCanonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toCanonicalJsonValue);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const canonical: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort((left, right) => left.localeCompare(right))) {
      canonical[key] = toCanonicalJsonValue(record[key]);
    }
    return canonical;
  }

  return value;
}

function deterministicHash(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

export function resolveArtifactFingerprint(params: {
  artifactType: SupportedArtifactType;
  traceId: string;
  payload: Record<string, unknown>;
}): string {
  const explicitFingerprint = params.payload.statementFingerprint;
  if (typeof explicitFingerprint === 'string' && explicitFingerprint.trim().length > 0) {
    return explicitFingerprint.trim();
  }

  const canonicalPayload = JSON.stringify(toCanonicalJsonValue(params.payload));
  return deterministicHash(`${params.artifactType}:${params.traceId}:${canonicalPayload}`);
}

export function projectNextArtifactVersionLineage(params: {
  traceId: string;
  artifactType: SupportedArtifactType;
  payload: Record<string, unknown>;
  latestVersion: ArtifactVersionLineageInput | null;
}): ArtifactVersionLineage {
  return {
    traceId: params.traceId,
    artifactType: params.artifactType,
    artifactVersion: (params.latestVersion?.artifactVersion ?? 0) + 1,
    fingerprint: resolveArtifactFingerprint({
      artifactType: params.artifactType,
      traceId: params.traceId,
      payload: params.payload,
    }),
    rebuiltFromVersionId: params.latestVersion?.id ?? null,
  };
}

export function enforceArtifactResendRateLimit(params: {
  traceId: string;
  rateLimit: RateLimitResult;
}): { remaining: number; resetAt: Date } {
  if (!params.rateLimit.allowed) {
    throw new ArtifactGovernanceError(
      'ARTIFACT_RESEND_RATE_LIMITED',
      'Artifact resend is rate limited by governance policy.',
      {
        traceId: params.traceId,
        resetAt: params.rateLimit.resetAt.toISOString(),
      },
    );
  }

  return {
    remaining: params.rateLimit.remaining,
    resetAt: params.rateLimit.resetAt,
  };
}

function toArtifactVersionRecord(
  row: typeof paymentArtifactVersions.$inferSelect,
): ArtifactVersionRecord {
  return {
    id: row.id,
    traceId: row.traceId,
    artifactType: assertSupportedArtifactType(row.artifactType),
    artifactVersion: row.artifactVersion,
    fingerprint: row.fingerprint,
    rebuiltFromVersionId: row.rebuiltFromVersionId ?? null,
    reasonCode: row.reasonCode,
    requestedByUserId: row.requestedByUserId,
    createdAt: row.createdAt,
  };
}

function toArtifactDeliveryRecord(
  row: typeof paymentArtifactDeliveries.$inferSelect,
): ArtifactDeliveryRecord {
  return {
    id: row.id,
    artifactVersionId: row.artifactVersionId,
    traceId: row.traceId,
    artifactType: assertSupportedArtifactType(row.artifactType),
    channel: row.channel,
    recipientReference: row.recipientReference ?? null,
    reasonCode: row.reasonCode,
    requestedByUserId: row.requestedByUserId,
    createdAt: row.createdAt,
  };
}

async function buildPayoutStatementPayloadFromTrace(params: {
  traceId: string;
}): Promise<Record<string, unknown>> {
  const payoutRequest = await db.query.payoutRequests.findFirst({
    where: and(eq(payoutRequests.traceId, params.traceId), isNull(payoutRequests.deletedAt)),
    columns: {
      organizerId: true,
      id: true,
      traceId: true,
    },
  });

  if (!payoutRequest) {
    throw new ArtifactGovernanceError(
      'ARTIFACT_TRACE_NOT_FOUND',
      `No payout artifact source found for traceId=${params.traceId}.`,
      { traceId: params.traceId },
    );
  }

  const artifact = await generatePayoutStatementArtifact({
    organizerId: payoutRequest.organizerId,
    payoutRequestId: payoutRequest.id,
  });

  return artifact as unknown as Record<string, unknown>;
}

function readRecipientReferenceFromPayload(payload: Record<string, unknown>): string | null {
  const accessReference = toPayloadRecord(payload.accessReference);
  const href = accessReference.href;
  if (typeof href !== 'string') return null;
  const normalized = href.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function rebuildArtifactForTrace(params: {
  traceId: string;
  artifactType: string;
  reasonCode: string;
  actorUserId: string;
  scope?: ArtifactGovernanceOperationScope;
  request?: {
    ipAddress?: string;
    userAgent?: string;
  };
}): Promise<ArtifactRebuildResult> {
  const traceId = normalizeArtifactGovernanceTraceScope({
    traceId: params.traceId,
    scope: params.scope,
  });
  const artifactType = assertSupportedArtifactType(params.artifactType);
  const reasonCode = normalizeArtifactGovernanceReason(params.reasonCode);

  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select()
      .from(paymentArtifactVersions)
      .where(
        and(
          eq(paymentArtifactVersions.traceId, traceId),
          eq(paymentArtifactVersions.artifactType, artifactType),
        ),
      )
      .orderBy(desc(paymentArtifactVersions.artifactVersion), desc(paymentArtifactVersions.createdAt))
      .limit(1);

    let payload: Record<string, unknown>;
    if (artifactType === 'payout_statement') {
      payload = await buildPayoutStatementPayloadFromTrace({
        traceId,
      });
    } else {
      throw new ArtifactGovernanceError(
        'ARTIFACT_UNSUPPORTED_TYPE',
        `Unsupported artifact type: ${artifactType}`,
      );
    }

    const lineage = projectNextArtifactVersionLineage({
      traceId,
      artifactType,
      payload,
      latestVersion: latest
        ? {
            id: latest.id,
            artifactVersion: latest.artifactVersion,
          }
        : null,
    });

    const [versionRow] = await tx
      .insert(paymentArtifactVersions)
      .values({
        traceId: lineage.traceId,
        artifactType: lineage.artifactType,
        artifactVersion: lineage.artifactVersion,
        fingerprint: lineage.fingerprint,
        payloadJson: payload,
        rebuiltFromVersionId: lineage.rebuiltFromVersionId,
        reasonCode,
        requestedByUserId: params.actorUserId,
      })
      .returning();

    const [deliveryRow] = await tx
      .insert(paymentArtifactDeliveries)
      .values({
        artifactVersionId: versionRow.id,
        traceId,
        artifactType,
        channel: 'api_pull',
        recipientReference: readRecipientReferenceFromPayload(payload),
        reasonCode,
        requestedByUserId: params.actorUserId,
      })
      .returning();

    const auditResult = await createAuditLog(
      {
        organizationId: null,
        actorUserId: params.actorUserId,
        action: 'policy.update',
        entityType: 'payment_artifact_version',
        entityId: versionRow.id,
        before: latest
          ? {
              artifactVersion: latest.artifactVersion,
              fingerprint: latest.fingerprint,
              versionId: latest.id,
            }
          : undefined,
        after: {
          traceId,
          artifactType,
          artifactVersion: versionRow.artifactVersion,
          versionId: versionRow.id,
          rebuiltFromVersionId: versionRow.rebuiltFromVersionId,
          deliveryId: deliveryRow.id,
          reasonCode,
        },
        request: params.request,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error(auditResult.error ?? 'Failed to create audit log');
    }

    return {
      version: toArtifactVersionRecord(versionRow),
      delivery: toArtifactDeliveryRecord(deliveryRow),
    };
  });
}

export async function resendArtifactForTrace(params: {
  traceId: string;
  artifactType: string;
  reasonCode: string;
  actorUserId: string;
  artifactVersion?: number;
  scope?: ArtifactGovernanceOperationScope;
  request?: {
    ipAddress?: string;
    userAgent?: string;
  };
}): Promise<ArtifactResendResult> {
  const traceId = normalizeArtifactGovernanceTraceScope({
    traceId: params.traceId,
    scope: params.scope,
  });
  const artifactType = assertSupportedArtifactType(params.artifactType);
  const reasonCode = normalizeArtifactGovernanceReason(params.reasonCode);

  const rateLimit = await checkRateLimit(params.actorUserId, 'user', {
    action: 'payments_artifact_resend',
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  });
  const resendRateLimit = enforceArtifactResendRateLimit({
    traceId,
    rateLimit,
  });

  return db.transaction(async (tx) => {
    const [versionRow] =
      typeof params.artifactVersion === 'number' && Number.isInteger(params.artifactVersion)
        ? await tx
            .select()
            .from(paymentArtifactVersions)
            .where(
              and(
                eq(paymentArtifactVersions.traceId, traceId),
                eq(paymentArtifactVersions.artifactType, artifactType),
                eq(paymentArtifactVersions.artifactVersion, params.artifactVersion),
              ),
            )
            .orderBy(desc(paymentArtifactVersions.createdAt))
            .limit(1)
        : await tx
            .select()
            .from(paymentArtifactVersions)
            .where(
              and(
                eq(paymentArtifactVersions.traceId, traceId),
                eq(paymentArtifactVersions.artifactType, artifactType),
              ),
            )
            .orderBy(desc(paymentArtifactVersions.artifactVersion), desc(paymentArtifactVersions.createdAt))
            .limit(1);

    if (!versionRow) {
      throw new ArtifactGovernanceError(
        'ARTIFACT_VERSION_NOT_FOUND',
        `No artifact version found for traceId=${traceId}.`,
        {
          traceId,
          artifactType,
          artifactVersion: params.artifactVersion,
        },
      );
    }

    const payload = toPayloadRecord(versionRow.payloadJson);
    const [deliveryRow] = await tx
      .insert(paymentArtifactDeliveries)
      .values({
        artifactVersionId: versionRow.id,
        traceId,
        artifactType,
        channel: 'api_pull_resend',
        recipientReference: readRecipientReferenceFromPayload(payload),
        reasonCode,
        requestedByUserId: params.actorUserId,
      })
      .returning();

    const auditResult = await createAuditLog(
      {
        organizationId: null,
        actorUserId: params.actorUserId,
        action: 'policy.update',
        entityType: 'payment_artifact_delivery',
        entityId: deliveryRow.id,
        after: {
          traceId,
          artifactType,
          artifactVersion: versionRow.artifactVersion,
          artifactVersionId: versionRow.id,
          deliveryId: deliveryRow.id,
          reasonCode,
          rateLimitRemaining: resendRateLimit.remaining,
          rateLimitResetAt: resendRateLimit.resetAt.toISOString(),
        },
        request: params.request,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error(auditResult.error ?? 'Failed to create audit log');
    }

    return {
      delivery: toArtifactDeliveryRecord(deliveryRow),
      rateLimit: {
        remaining: resendRateLimit.remaining,
        resetAt: resendRateLimit.resetAt,
      },
    };
  });
}

export async function getArtifactGovernanceSummary(params?: {
  limit?: number;
}): Promise<ArtifactGovernanceSummary> {
  'use cache: remote';

  const limit =
    typeof params?.limit === 'number' && Number.isFinite(params.limit) && params.limit > 0
      ? Math.trunc(params.limit)
      : 20;
  safeCacheTag(artifactGovernanceSummaryTag, `${artifactGovernanceSummaryTag}:${limit}`);
  safeCacheLife({ expire: 120 });

  const [versionRows, deliveryRows] = await Promise.all([
    db
      .select()
      .from(paymentArtifactVersions)
      .orderBy(desc(paymentArtifactVersions.createdAt), desc(paymentArtifactVersions.id))
      .limit(limit),
    db
      .select()
      .from(paymentArtifactDeliveries)
      .orderBy(desc(paymentArtifactDeliveries.createdAt), desc(paymentArtifactDeliveries.id))
      .limit(limit),
  ]);

  return {
    versions: versionRows.map(toArtifactVersionRecord),
    deliveries: deliveryRows.map(toArtifactDeliveryRecord),
  };
}
