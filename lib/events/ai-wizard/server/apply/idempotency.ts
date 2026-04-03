import { createHash } from 'node:crypto';

import type { EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';

import type { EventAiWizardApplyCore } from './types';

export type EventAiWizardApplyReplayKeyKind = 'explicit' | 'synthetic';

export function buildApplyCoreFromPatch(patch: EventAiWizardPatch): EventAiWizardApplyCore {
  return {
    title: patch.title,
    summary: patch.summary,
    risky: patch.risky,
    ops: patch.ops,
    markdownOutputs: patch.markdownOutputs,
  };
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function fingerprintApplyCore(core: EventAiWizardApplyCore): string {
  return createHash('sha256').update(stableSerialize(core)).digest('hex');
}

export function buildSyntheticReplayKey(params: {
  actorUserId: string;
  editionId: string;
  proposalFingerprint: string;
}): string {
  const base = `${params.actorUserId}:${params.editionId}:${params.proposalFingerprint}`;
  return createHash('sha256').update(base).digest('hex');
}

export function buildExplicitReplayKey(params: {
  actorUserId: string;
  editionId: string;
  idempotencyKey: string;
}): string {
  const base = `${params.actorUserId}:${params.editionId}:idempotency:${params.idempotencyKey}`;
  return createHash('sha256').update(base).digest('hex');
}

export function buildApplyReplayIdentity(params: {
  actorUserId: string;
  editionId: string;
  proposalFingerprint: string;
  idempotencyKey?: string;
}): {
  replayKey: string;
  replayKeyKind: EventAiWizardApplyReplayKeyKind;
  syntheticReplayKey: string;
} {
  const syntheticReplayKey = buildSyntheticReplayKey({
    actorUserId: params.actorUserId,
    editionId: params.editionId,
    proposalFingerprint: params.proposalFingerprint,
  });

  const normalizedIdempotencyKey = params.idempotencyKey?.trim();
  if (normalizedIdempotencyKey) {
    return {
      replayKey: buildExplicitReplayKey({
        actorUserId: params.actorUserId,
        editionId: params.editionId,
        idempotencyKey: normalizedIdempotencyKey,
      }),
      replayKeyKind: 'explicit',
      syntheticReplayKey,
    };
  }

  return {
    replayKey: syntheticReplayKey,
    replayKeyKind: 'synthetic',
    syntheticReplayKey,
  };
}
