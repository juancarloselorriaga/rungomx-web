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
import { recomputeNationalRankingsOnPublish } from '@/lib/events/results/ranking-publication';
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

type ResultMutationClient = Pick<typeof db, 'query' | 'update'>;

type DeriveAndPersistDraftPlacements = (
  resultVersionId: string,
  client?: ResultMutationClient,
) => Promise<unknown>;

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
      // Finalize a specific draft when the caller names one, otherwise the newest draft.
      ...(params.input.resultVersionId
        ? [eq(resultVersions.id, params.input.resultVersionId)]
        : []),
    ),
    orderBy: (rv, { desc: descOrder }) => [descOrder(rv.versionNumber), descOrder(rv.createdAt)],
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

  const finalizedAt = new Date();

  // Derive placements and flip draft → official atomically so a crash can never leave an
  // official version with stale/unwritten placements (RES-11).
  const lifecycleTransition = await db.transaction(async (tx) => {
    await params.deriveAndPersistDraftPlacements(draftVersion.id, tx);
    return transitionResultVersionLifecycle({
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
      client: tx,
    });
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

  // Refresh the public national leaderboard from the newly official data. Non-blocking:
  // a ranking failure must not fail the finalization the organizer just confirmed (§6.4).
  try {
    await recomputeNationalRankingsOnPublish({
      triggerResultVersionId: lifecycleTransition.data.id,
    });
  } catch (error) {
    console.error('[finalizeResultVersionAttestation] ranking recompute failed', error);
  }

  return {
    ok: true,
    data: {
      resultVersion: lifecycleTransition.data,
      gate,
    },
  };
}
