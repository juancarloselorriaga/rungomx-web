import { and, eq } from 'drizzle-orm';

import { eventAiWizardApplyReplays } from '@/db/schema';

import type { EventAiWizardApplyEngineInput } from './types';
import type { ApplyTx } from './db-client';

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

  const existingReplay = await params.tx.query.eventAiWizardApplyReplays.findFirst({
    where: and(
      eq(eventAiWizardApplyReplays.actorUserId, params.input.actorUserId),
      eq(eventAiWizardApplyReplays.organizationId, params.input.organizationId),
      eq(eventAiWizardApplyReplays.editionId, params.input.editionId),
      eq(eventAiWizardApplyReplays.replayKey, params.input.replayKey),
    ),
    columns: {
      proposalFingerprint: true,
      proposalId: true,
    },
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
