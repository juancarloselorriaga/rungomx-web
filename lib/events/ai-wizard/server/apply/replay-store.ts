import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventAiWizardApplyReplays } from '@/db/schema';

import type { EventAiWizardApplyEngineInput } from './types';
import type { ApplyTx } from './db-client';

export async function getExistingApplyReplay(params: {
  actorUserId: string;
  organizationId: string;
  editionId: string;
  replayKey: string;
}) {
  return dbQueryApplyReplay(params);
}

async function dbQueryApplyReplay(params: {
  actorUserId: string;
  organizationId: string;
  editionId: string;
  replayKey: string;
  tx?: ApplyTx;
}) {
  const replayQuery = params.tx?.query.eventAiWizardApplyReplays ?? db.query.eventAiWizardApplyReplays;

  return replayQuery.findFirst({
    where: and(
      eq(eventAiWizardApplyReplays.actorUserId, params.actorUserId),
      eq(eventAiWizardApplyReplays.organizationId, params.organizationId),
      eq(eventAiWizardApplyReplays.editionId, params.editionId),
      eq(eventAiWizardApplyReplays.replayKey, params.replayKey),
    ),
    columns: {
      proposalFingerprint: true,
      proposalId: true,
    },
  });
}

export async function claimApplyReplay(params: {
  input: EventAiWizardApplyEngineInput;
  tx: ApplyTx;
}): Promise<
  | { status: 'claimed' }
  | { status: 'duplicate' }
  | {
      status: 'conflict';
      existingProposalFingerprint: string;
      existingProposalId: string | null;
    }
> {
  const [claimedReplay] = await params.tx
    .insert(eventAiWizardApplyReplays)
    .values({
      organizationId: params.input.organizationId,
      actorUserId: params.input.actorUserId,
      editionId: params.input.editionId,
      proposalId: params.input.proposalId ?? null,
      proposalFingerprint: params.input.proposalFingerprint,
      idempotencyKey: params.input.idempotencyKey ?? null,
      replayKey: params.input.replayKey,
      replayKeyKind: params.input.replayKeyKind,
      syntheticReplayKey: params.input.syntheticReplayKey,
    })
    .onConflictDoNothing({
      target: [
        eventAiWizardApplyReplays.actorUserId,
        eventAiWizardApplyReplays.organizationId,
        eventAiWizardApplyReplays.editionId,
        eventAiWizardApplyReplays.replayKey,
      ],
    })
    .returning({ id: eventAiWizardApplyReplays.id });

  if (claimedReplay) {
    return { status: 'claimed' };
  }

  const existingReplay = await dbQueryApplyReplay({
    actorUserId: params.input.actorUserId,
    organizationId: params.input.organizationId,
    editionId: params.input.editionId,
    replayKey: params.input.replayKey,
    tx: params.tx,
  });

  if (
    params.input.replayKeyKind === 'explicit' &&
    existingReplay &&
    existingReplay.proposalFingerprint !== params.input.proposalFingerprint
  ) {
    return {
      status: 'conflict',
      existingProposalFingerprint: existingReplay.proposalFingerprint,
      existingProposalId: existingReplay.proposalId,
    };
  }

  return { status: 'duplicate' };
}
