import { createHash } from 'node:crypto';

import type { EventAiWizardPatch } from '@/lib/events/ai-wizard/schemas';

import type { EventAiWizardApplyCore } from './types';

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
