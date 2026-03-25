import { and, eq, isNull } from 'drizzle-orm';

import type { AuthenticatedContext } from '@/lib/auth/guards';
import { db } from '@/db';
import { eventEditions, resultVersions } from '@/db/schema';
import {
  FINALIZATION_ATTESTATION_REQUIRED_ERROR,
  FINALIZATION_BLOCKED_ERROR,
  FINALIZATION_EMPTY_DRAFT_ERROR,
} from '@/lib/events/results/shared/errors';
import { createResultsFinalizationAudit } from '@/lib/events/results/shared/audit';
import { revalidateResultsPublicationArtifacts } from '@/lib/events/results/shared/cache';
import { transitionResultVersionLifecycle } from '@/lib/events/results/lifecycle/state-machine';
import type { FinalizeResultVersionAttestationInput } from '@/lib/events/results/schemas';
import type {
  ResultVersionFinalizationGateSummary,
  ResultVersionFinalizationResponse,
} from '@/lib/events/results/types';
import type { ActionResult } from '@/lib/events/shared';

type AssertCanWriteResultsForEdition = (
  userId: string,
  editionId: string,
  canManageEvents: boolean,
) => Promise<boolean>;

type BuildDraftFinalizationGateSummary = (
  resultVersionId: string,
) => Promise<ResultVersionFinalizationGateSummary>;

type DeriveAndPersistDraftPlacements = (resultVersionId: string) => Promise<unknown>;

export async function finalizeResultVersionAttestationWorkflow(params: {
  authContext: AuthenticatedContext;
  input: FinalizeResultVersionAttestationInput;
  assertCanWriteResultsForEdition: AssertCanWriteResultsForEdition;
  buildDraftFinalizationGateSummary: BuildDraftFinalizationGateSummary;
  deriveAndPersistDraftPlacements: DeriveAndPersistDraftPlacements;
}): Promise<ActionResult<ResultVersionFinalizationResponse>> {
  const { editionId, attestationConfirmed, attestationNote } = params.input;
  if (!attestationConfirmed) {
    return {
      ok: false,
      error: FINALIZATION_ATTESTATION_REQUIRED_ERROR,
      code: 'VALIDATION_ERROR',
    };
  }

  const draftVersion = await db.query.resultVersions.findFirst({
    where: and(
      eq(resultVersions.editionId, editionId),
      eq(resultVersions.status, 'draft'),
      isNull(resultVersions.deletedAt),
    ),
    orderBy: (rv, { desc }) => [desc(rv.versionNumber), desc(rv.createdAt)],
  });

  if (!draftVersion) {
    return {
      ok: false,
      error: 'No draft result version available for publishing',
      code: 'NOT_FOUND',
    };
  }

  const canWrite = await params.assertCanWriteResultsForEdition(
    params.authContext.user.id,
    draftVersion.editionId,
    params.authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  const gate = await params.buildDraftFinalizationGateSummary(draftVersion.id);
  if (gate.rowCount === 0) {
    return {
      ok: false,
      error: FINALIZATION_EMPTY_DRAFT_ERROR,
      code: 'VALIDATION_ERROR',
    };
  }
  if (!gate.canProceed) {
    return {
      ok: false,
      error: FINALIZATION_BLOCKED_ERROR,
      code: 'VALIDATION_ERROR',
    };
  }

  await params.deriveAndPersistDraftPlacements(draftVersion.id);

  const finalizedAt = new Date();
  const lifecycleTransition = await transitionResultVersionLifecycle({
    resultVersionId: draftVersion.id,
    toStatus: 'official',
    finalizedByUserId: params.authContext.user.id,
    finalizedAt,
    transitionReason: 'attestation',
    provenancePatch: {
      attestation: {
        confirmed: true,
        attestedByUserId: params.authContext.user.id,
        attestedAt: finalizedAt.toISOString(),
        sourceLane: draftVersion.source,
        note: attestationNote ?? null,
      },
    },
  });

  if (!lifecycleTransition.ok) {
    return lifecycleTransition;
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, draftVersion.editionId), isNull(eventEditions.deletedAt)),
    columns: { id: true },
    with: {
      series: {
        columns: {
          organizationId: true,
        },
      },
    },
  });

  const finalizationAudit = await createResultsFinalizationAudit({
    organizationId: edition?.series?.organizationId ?? null,
    actorUserId: params.authContext.user.id,
    entityId: lifecycleTransition.data.id,
    editionId: draftVersion.editionId,
    previousStatus: draftVersion.status,
    previousVersionNumber: draftVersion.versionNumber,
    nextStatus: lifecycleTransition.data.status,
    nextVersionNumber: lifecycleTransition.data.versionNumber,
    finalizedAtIso: lifecycleTransition.data.finalizedAt?.toISOString() ?? null,
    finalizedByUserId: lifecycleTransition.data.finalizedByUserId,
    gate,
    attestationNote: attestationNote ?? null,
  });

  if (!finalizationAudit.ok) {
    return {
      ok: false,
      error: 'Failed to create audit log for result finalization',
      code: 'SERVER_ERROR',
    };
  }

  await revalidateResultsPublicationArtifacts({
    editionId: draftVersion.editionId,
    organizationId: edition?.series?.organizationId,
  });

  return {
    ok: true,
    data: {
      resultVersion: lifecycleTransition.data,
      gate,
    },
  };
}
