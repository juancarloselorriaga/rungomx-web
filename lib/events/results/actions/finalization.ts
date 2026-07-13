import { and, eq, isNull } from 'drizzle-orm';

import type { AuthenticatedContext } from '@/lib/auth/guards';
import { db } from '@/db';
import { eventEditions, resultVersions } from '@/db/schema';
import {
  FINALIZATION_ATTESTATION_REQUIRED_ERROR,
  FINALIZATION_BLOCKED_ERROR,
  FINALIZATION_EMPTY_DRAFT_ERROR,
  RESULT_DRAFT_NO_LONGER_EDITABLE_ERROR,
} from '@/lib/events/results/shared/errors';
import { createResultsFinalizationAudit } from '@/lib/events/results/shared/audit';
import { revalidateResultsPublicationArtifacts } from '@/lib/events/results/shared/cache';
import { recomputeNationalRankingsOnPublish } from '@/lib/events/results/ranking-publication';
import { transitionResultVersionLifecycle } from '@/lib/events/results/lifecycle/state-machine';
import { lockResultVersion } from '@/lib/events/results/shared/version-lock';
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

type ResultMutationClient = Pick<typeof db, 'query' | 'update'>;

type BuildDraftFinalizationGateSummary = (
  resultVersionId: string,
  client?: ResultMutationClient,
) => Promise<ResultVersionFinalizationGateSummary>;

type DeriveAndPersistDraftPlacements = (
  resultVersionId: string,
  client?: ResultMutationClient,
) => Promise<unknown>;

// Sentinel carrying the ActionResult to return when finalization must abort inside the
// transaction (draft flipped/removed under lock, empty draft, or blocking rows added after
// the pre-check). Thrown to roll back, caught immediately after the transaction.
class FinalizeAbort extends Error {
  constructor(public readonly result: ActionResult<ResultVersionFinalizationResponse>) {
    super('finalize-abort');
  }
}

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

  const finalizedAt = new Date();

  // Everything that must be consistent runs under one lock in one transaction: lock the
  // draft, re-check it is still a draft, re-run the gate against the locked rows (so a
  // concurrent importer can't slip a blocking row past a pre-check), derive placements, and
  // flip draft → official (RES-11, P1). The gate result is threaded back out for the audit.
  let gate: ResultVersionFinalizationGateSummary;
  let lifecycleData: ResultVersionFinalizationResponse['resultVersion'];
  try {
    const outcome = await db.transaction(async (tx) => {
      const locked = await lockResultVersion(tx, draftVersion.id);
      if (!locked || locked.status !== 'draft') {
        throw new FinalizeAbort({
          ok: false,
          error: RESULT_DRAFT_NO_LONGER_EDITABLE_ERROR,
          code: 'CONFLICT',
        });
      }

      const gateSummary = await params.buildDraftFinalizationGateSummary(draftVersion.id, tx);
      if (gateSummary.rowCount === 0) {
        throw new FinalizeAbort({
          ok: false,
          error: FINALIZATION_EMPTY_DRAFT_ERROR,
          code: 'VALIDATION_ERROR',
        });
      }
      if (!gateSummary.canProceed) {
        throw new FinalizeAbort({
          ok: false,
          error: FINALIZATION_BLOCKED_ERROR,
          code: 'VALIDATION_ERROR',
        });
      }

      await params.deriveAndPersistDraftPlacements(draftVersion.id, tx);
      const transition = await transitionResultVersionLifecycle({
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
        client: tx as ResultMutationClient,
      });
      if (!transition.ok) {
        throw new FinalizeAbort(transition);
      }

      return { gate: gateSummary, resultVersion: transition.data };
    });
    gate = outcome.gate;
    lifecycleData = outcome.resultVersion;
  } catch (error) {
    if (error instanceof FinalizeAbort) return error.result;
    throw error;
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
    entityId: lifecycleData.id,
    editionId: draftVersion.editionId,
    previousStatus: draftVersion.status,
    previousVersionNumber: draftVersion.versionNumber,
    nextStatus: lifecycleData.status,
    nextVersionNumber: lifecycleData.versionNumber,
    finalizedAtIso: lifecycleData.finalizedAt?.toISOString() ?? null,
    finalizedByUserId: lifecycleData.finalizedByUserId,
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
      triggerResultVersionId: lifecycleData.id,
    });
  } catch (error) {
    console.error('[finalizeResultVersionAttestation] ranking recompute failed', error);
  }

  return {
    ok: true,
    data: {
      resultVersion: lifecycleData,
      gate,
    },
  };
}
