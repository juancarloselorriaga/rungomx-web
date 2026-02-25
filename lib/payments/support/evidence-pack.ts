'server only';

import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  disputeCases,
  moneyEvents,
  moneyTraces,
  paymentArtifactDeliveries,
  paymentArtifactVersions,
  payoutRequests,
  refundRequests,
} from '@/db/schema';
import {
  projectOwnershipTimeline,
  type OwnershipTimelineProjection,
} from '@/lib/payments/support/ownership-states';

export const evidencePackViewRoles = ['attendee', 'organizer', 'support', 'admin'] as const;
export type EvidencePackViewRole = (typeof evidencePackViewRoles)[number];

export type EvidencePackLifecycleEvent = {
  id: string;
  eventName: string;
  entityType: string;
  entityId: string;
  occurredAt: Date;
  payloadJson: Record<string, unknown>;
  metadataJson: Record<string, unknown>;
};

export type EvidencePackArtifactVersion = {
  id: string;
  artifactType: string;
  artifactVersion: number;
  fingerprint: string;
  rebuiltFromVersionId: string | null;
  reasonCode: string;
  requestedByUserId: string;
  createdAt: Date;
};

export type EvidencePackArtifactDelivery = {
  id: string;
  artifactVersionId: string;
  artifactType: string;
  channel: string;
  recipientReference: string | null;
  reasonCode: string;
  requestedByUserId: string;
  createdAt: Date;
};

export type FinancialEvidencePack = {
  traceId: string;
  rootEntity: {
    entityType: string;
    entityId: string;
  };
  organizerId: string | null;
  generatedAt: Date;
  keyTimestamps: {
    traceCreatedAt: Date;
    firstEventAt: Date | null;
    lastEventAt: Date | null;
  };
  lifecycleEvents: EvidencePackLifecycleEvent[];
  artifacts: {
    versions: EvidencePackArtifactVersion[];
    deliveries: EvidencePackArtifactDelivery[];
  };
  policyContext: Record<string, unknown>;
  ownership: OwnershipTimelineProjection;
  redaction: {
    viewRole: EvidencePackViewRole;
    redactedPaths: string[];
  };
};

export type EvidencePackProjectionInput = {
  traceId: string;
  rootEntityType: string;
  rootEntityId: string;
  organizerId: string | null;
  traceCreatedAt: Date;
  lifecycleEvents: EvidencePackLifecycleEvent[];
  artifactVersions: EvidencePackArtifactVersion[];
  artifactDeliveries: EvidencePackArtifactDelivery[];
  policyContext: Record<string, unknown>;
  viewRole: EvidencePackViewRole;
  generatedAt?: Date;
};

const restrictedEvidenceKeys = new Set([
  'adminRiskNotes',
  'internalNote',
  'restrictedMetadata',
  'riskSignals',
  'fraudSignal',
  'manualReviewNotes',
]);

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeViewRole(value: EvidencePackViewRole): EvidencePackViewRole {
  return evidencePackViewRoles.includes(value) ? value : 'support';
}

type RedactionResult = {
  value: unknown;
  redactedPaths: string[];
};

function redactRestrictedFields(value: unknown, currentPath = ''): RedactionResult {
  if (Array.isArray(value)) {
    const redactedPaths: string[] = [];
    const nextValue = value.map((item, index) => {
      const result = redactRestrictedFields(item, `${currentPath}[${index}]`);
      redactedPaths.push(...result.redactedPaths);
      return result.value;
    });

    return {
      value: nextValue,
      redactedPaths,
    };
  }

  if (!value || typeof value !== 'object') {
    return {
      value,
      redactedPaths: [],
    };
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  const redactedPaths: string[] = [];

  for (const key of Object.keys(input)) {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    if (restrictedEvidenceKeys.has(key)) {
      redactedPaths.push(nextPath);
      continue;
    }

    const nested = redactRestrictedFields(input[key], nextPath);
    output[key] = nested.value;
    redactedPaths.push(...nested.redactedPaths);
  }

  return {
    value: output,
    redactedPaths,
  };
}

function sortLifecycleEvents(events: EvidencePackLifecycleEvent[]): EvidencePackLifecycleEvent[] {
  return [...events].sort((left, right) => {
    const occurredDiff = left.occurredAt.getTime() - right.occurredAt.getTime();
    if (occurredDiff !== 0) return occurredDiff;

    const entityDiff = left.entityType.localeCompare(right.entityType);
    if (entityDiff !== 0) return entityDiff;

    const idDiff = left.entityId.localeCompare(right.entityId);
    if (idDiff !== 0) return idDiff;

    return left.id.localeCompare(right.id);
  });
}

function sortArtifactVersions(rows: EvidencePackArtifactVersion[]): EvidencePackArtifactVersion[] {
  return [...rows].sort((left, right) => {
    const versionDiff = left.artifactVersion - right.artifactVersion;
    if (versionDiff !== 0) return versionDiff;

    const createdDiff = left.createdAt.getTime() - right.createdAt.getTime();
    if (createdDiff !== 0) return createdDiff;

    return left.id.localeCompare(right.id);
  });
}

function sortArtifactDeliveries(rows: EvidencePackArtifactDelivery[]): EvidencePackArtifactDelivery[] {
  return [...rows].sort((left, right) => {
    const createdDiff = left.createdAt.getTime() - right.createdAt.getTime();
    if (createdDiff !== 0) return createdDiff;
    return left.id.localeCompare(right.id);
  });
}

export function projectFinancialEvidencePack(
  input: EvidencePackProjectionInput,
): FinancialEvidencePack {
  const viewRole = normalizeViewRole(input.viewRole);
  const isPrivileged = viewRole === 'support' || viewRole === 'admin';

  const sortedEvents = sortLifecycleEvents(input.lifecycleEvents);
  const sortedVersions = sortArtifactVersions(input.artifactVersions);
  const sortedDeliveries = sortArtifactDeliveries(input.artifactDeliveries);
  const ownership = projectOwnershipTimeline({
    rootEntityType: input.rootEntityType,
    events: sortedEvents.map((event) => ({
      id: event.id,
      eventName: event.eventName,
      occurredAt: event.occurredAt,
    })),
  });

  const basePack: FinancialEvidencePack = {
    traceId: input.traceId,
    rootEntity: {
      entityType: input.rootEntityType,
      entityId: input.rootEntityId,
    },
    organizerId: input.organizerId,
    generatedAt: input.generatedAt ?? new Date(),
    keyTimestamps: {
      traceCreatedAt: input.traceCreatedAt,
      firstEventAt: sortedEvents[0]?.occurredAt ?? null,
      lastEventAt: sortedEvents[sortedEvents.length - 1]?.occurredAt ?? null,
    },
    lifecycleEvents: sortedEvents,
    artifacts: {
      versions: sortedVersions,
      deliveries: sortedDeliveries,
    },
    policyContext: input.policyContext,
    ownership,
    redaction: {
      viewRole,
      redactedPaths: [],
    },
  };

  if (isPrivileged) {
    return basePack;
  }

  const redactedPaths: string[] = [];
  const lifecycleEvents = sortedEvents.map((event, index) => {
    const payloadResult = redactRestrictedFields(event.payloadJson, `lifecycleEvents[${index}].payloadJson`);
    const metadataResult = redactRestrictedFields(
      event.metadataJson,
      `lifecycleEvents[${index}].metadataJson`,
    );
    redactedPaths.push(...payloadResult.redactedPaths, ...metadataResult.redactedPaths);

    return {
      ...event,
      payloadJson: toRecord(payloadResult.value),
      metadataJson: toRecord(metadataResult.value),
    };
  });

  const policyContextResult = redactRestrictedFields(input.policyContext, 'policyContext');
  redactedPaths.push(...policyContextResult.redactedPaths);

  return {
    ...basePack,
    organizerId: basePack.organizerId ? `${basePack.organizerId.slice(0, 8)}…${basePack.organizerId.slice(-4)}` : null,
    lifecycleEvents,
    policyContext: toRecord(policyContextResult.value),
    redaction: {
      viewRole,
      redactedPaths: Array.from(new Set(redactedPaths)).sort((left, right) =>
        left.localeCompare(right),
      ),
    },
  };
}

function mapLifecycleEventRow(row: {
  id: string;
  eventName: string;
  entityType: string;
  entityId: string;
  occurredAt: Date;
  payloadJson: Record<string, unknown>;
  metadataJson: Record<string, unknown>;
}): EvidencePackLifecycleEvent {
  return {
    id: row.id,
    eventName: row.eventName,
    entityType: row.entityType,
    entityId: row.entityId,
    occurredAt: row.occurredAt,
    payloadJson: row.payloadJson,
    metadataJson: row.metadataJson,
  };
}

function mapArtifactVersionRow(
  row: typeof paymentArtifactVersions.$inferSelect,
): EvidencePackArtifactVersion {
  return {
    id: row.id,
    artifactType: row.artifactType,
    artifactVersion: row.artifactVersion,
    fingerprint: row.fingerprint,
    rebuiltFromVersionId: row.rebuiltFromVersionId ?? null,
    reasonCode: row.reasonCode,
    requestedByUserId: row.requestedByUserId,
    createdAt: row.createdAt,
  };
}

function mapArtifactDeliveryRow(
  row: typeof paymentArtifactDeliveries.$inferSelect,
): EvidencePackArtifactDelivery {
  return {
    id: row.id,
    artifactVersionId: row.artifactVersionId,
    artifactType: row.artifactType,
    channel: row.channel,
    recipientReference: row.recipientReference ?? null,
    reasonCode: row.reasonCode,
    requestedByUserId: row.requestedByUserId,
    createdAt: row.createdAt,
  };
}

async function loadPolicyContext(params: {
  traceId: string;
  rootEntityType: string;
  rootEntityId: string;
}): Promise<Record<string, unknown>> {
  const [payoutRequest, refundRequest, disputeCase] = await Promise.all([
    db.query.payoutRequests.findFirst({
      where: and(eq(payoutRequests.traceId, params.traceId), isNull(payoutRequests.deletedAt)),
      columns: {
        id: true,
        status: true,
        requestedAt: true,
        lifecycleContextJson: true,
      },
    }),
    params.rootEntityType.includes('refund')
      ? db.query.refundRequests.findFirst({
          where: and(eq(refundRequests.id, params.rootEntityId), isNull(refundRequests.deletedAt)),
          columns: {
            id: true,
            status: true,
            reasonCode: true,
            requestedAt: true,
            decisionAt: true,
            executedAt: true,
          },
        })
      : Promise.resolve(null),
    params.rootEntityType.includes('dispute')
      ? db.query.disputeCases.findFirst({
          where: and(eq(disputeCases.id, params.rootEntityId), isNull(disputeCases.deletedAt)),
          columns: {
            id: true,
            status: true,
            reasonCode: true,
            evidenceDeadlineAt: true,
            openedAt: true,
            closedAt: true,
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    payoutRequest: payoutRequest
      ? {
          id: payoutRequest.id,
          status: payoutRequest.status,
          requestedAt: payoutRequest.requestedAt,
          lifecycleContext: toRecord(payoutRequest.lifecycleContextJson),
        }
      : null,
    refundRequest: refundRequest
      ? {
          id: refundRequest.id,
          status: refundRequest.status,
          reasonCode: refundRequest.reasonCode,
          requestedAt: refundRequest.requestedAt,
          decisionAt: refundRequest.decisionAt,
          executedAt: refundRequest.executedAt,
        }
      : null,
    disputeCase: disputeCase
      ? {
          id: disputeCase.id,
          status: disputeCase.status,
          reasonCode: disputeCase.reasonCode,
          evidenceDeadlineAt: disputeCase.evidenceDeadlineAt,
          openedAt: disputeCase.openedAt,
          closedAt: disputeCase.closedAt,
        }
      : null,
  };
}

export async function buildFinancialEvidencePack(params: {
  traceId: string;
  viewRole?: EvidencePackViewRole;
  eventLimit?: number;
}): Promise<FinancialEvidencePack | null> {
  const traceId = params.traceId.trim();
  if (!traceId) {
    return null;
  }

  const eventLimit =
    typeof params.eventLimit === 'number' && Number.isFinite(params.eventLimit) && params.eventLimit > 0
      ? Math.trunc(params.eventLimit)
      : 250;

  const trace = await db.query.moneyTraces.findFirst({
    where: eq(moneyTraces.traceId, traceId),
    columns: {
      traceId: true,
      organizerId: true,
      rootEntityType: true,
      rootEntityId: true,
      createdAt: true,
    },
  });

  if (!trace) {
    return null;
  }

  const [eventRows, artifactVersionRows, artifactDeliveryRows, policyContext] = await Promise.all([
    db
      .select({
        id: moneyEvents.id,
        eventName: moneyEvents.eventName,
        entityType: moneyEvents.entityType,
        entityId: moneyEvents.entityId,
        occurredAt: moneyEvents.occurredAt,
        payloadJson: moneyEvents.payloadJson,
        metadataJson: moneyEvents.metadataJson,
      })
      .from(moneyEvents)
      .where(eq(moneyEvents.traceId, trace.traceId))
      .orderBy(asc(moneyEvents.occurredAt), asc(moneyEvents.createdAt), asc(moneyEvents.id))
      .limit(eventLimit),
    db
      .select()
      .from(paymentArtifactVersions)
      .where(eq(paymentArtifactVersions.traceId, trace.traceId))
      .orderBy(desc(paymentArtifactVersions.artifactVersion), desc(paymentArtifactVersions.createdAt))
      .limit(60),
    db
      .select()
      .from(paymentArtifactDeliveries)
      .where(eq(paymentArtifactDeliveries.traceId, trace.traceId))
      .orderBy(desc(paymentArtifactDeliveries.createdAt), desc(paymentArtifactDeliveries.id))
      .limit(120),
    loadPolicyContext({
      traceId: trace.traceId,
      rootEntityType: trace.rootEntityType,
      rootEntityId: trace.rootEntityId,
    }),
  ]);

  return projectFinancialEvidencePack({
    traceId: trace.traceId,
    rootEntityType: trace.rootEntityType,
    rootEntityId: trace.rootEntityId,
    organizerId: trace.organizerId,
    traceCreatedAt: trace.createdAt,
    lifecycleEvents: eventRows.map(mapLifecycleEventRow),
    artifactVersions: artifactVersionRows.map(mapArtifactVersionRow),
    artifactDeliveries: artifactDeliveryRows.map(mapArtifactDeliveryRow),
    policyContext,
    viewRole: params.viewRole ?? 'support',
  });
}
