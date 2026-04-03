import { resolve } from 'path';

import { and, eq } from 'drizzle-orm';

import { eventAiWizardApplyReplays, eventEditions, eventSeries, organizations } from '@/db/schema';
import {
  buildExplicitReplayKey,
  buildSyntheticReplayKey,
} from '@/lib/events/ai-wizard/server/apply/idempotency';
import {
  claimApplyReplay,
  getExistingApplyReplay,
} from '@/lib/events/ai-wizard/server/apply/replay-store';
import type { EventAiWizardApplyEngineInput } from '@/lib/events/ai-wizard/server/apply/types';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';
import { createTestUser } from '@/tests/helpers/fixtures';
import { setupTestDatabaseEnv } from '@/testing/setup-db-env';

setupTestDatabaseEnv(resolve(process.cwd(), '.env.test'));

describe('ai wizard replay store (database)', () => {
  const testDb = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
  });

  async function seedApplyContext() {
    const user = await createTestUser(testDb, { emailVerified: true });

    const organizationId = '20000000-0000-4000-8000-000000000001';
    const seriesId = '30000000-0000-4000-8000-000000000001';
    const editionId = '40000000-0000-4000-8000-000000000001';

    await testDb.insert(organizations).values({
      id: organizationId,
      name: 'AI Wizard Replay Org',
      slug: 'ai-wizard-replay-org',
    });

    await testDb.insert(eventSeries).values({
      id: seriesId,
      organizationId,
      slug: 'ai-wizard-series',
      name: 'AI Wizard Series',
      sportType: 'running',
    });

    await testDb.insert(eventEditions).values({
      id: editionId,
      seriesId,
      editionLabel: '2026',
      publicCode: 'AIWIZ2026',
      slug: 'ai-wizard-2026',
      timezone: 'America/Mexico_City',
    });

    return {
      actorUserId: user.id,
      organizationId,
      editionId,
    };
  }

  function buildInput(params: {
    actorUserId: string;
    organizationId: string;
    editionId: string;
    proposalFingerprint: string;
    proposalId?: string;
    idempotencyKey?: string;
  }): EventAiWizardApplyEngineInput {
    const replayKey = params.idempotencyKey
      ? buildExplicitReplayKey({
          actorUserId: params.actorUserId,
          editionId: params.editionId,
          idempotencyKey: params.idempotencyKey,
        })
      : buildSyntheticReplayKey({
          actorUserId: params.actorUserId,
          editionId: params.editionId,
          proposalFingerprint: params.proposalFingerprint,
        });

    return {
      editionId: params.editionId,
      locale: 'es',
      actorUserId: params.actorUserId,
      organizationId: params.organizationId,
      event: {
        id: params.editionId,
        publicCode: 'AIWIZ2026',
        slug: 'ai-wizard-2026',
        editionLabel: '2026',
        visibility: 'draft',
        description: null,
        organizerBrief: null,
        startsAt: null,
        endsAt: null,
        timezone: 'America/Mexico_City',
        registrationOpensAt: null,
        registrationClosesAt: null,
        isRegistrationPaused: false,
        sharedCapacity: null,
        locationDisplay: null,
        address: null,
        city: null,
        state: null,
        country: 'MX',
        latitude: null,
        longitude: null,
        externalUrl: null,
        heroImageMediaId: null,
        heroImageUrl: null,
        seriesId: '30000000-0000-4000-8000-000000000001',
        seriesName: 'AI Wizard Series',
        seriesSlug: 'ai-wizard-series',
        sportType: 'running',
        organizationId: params.organizationId,
        organizationName: 'AI Wizard Replay Org',
        organizationSlug: 'ai-wizard-replay-org',
        distances: [],
        faqItems: [],
        waivers: [],
        policyConfig: null,
      },
      patch: {
        title: 'Replay test patch',
        summary: 'Replay test summary',
        ops: [],
        markdownOutputs: [],
      },
      core: {
        title: 'Replay test patch',
        summary: 'Replay test summary',
        ops: [],
        markdownOutputs: [],
      },
      proposalId: params.proposalId,
      proposalFingerprint: params.proposalFingerprint,
      idempotencyKey: params.idempotencyKey,
      replayKey,
      replayKeyKind: params.idempotencyKey ? ('explicit' as const) : ('synthetic' as const),
      syntheticReplayKey: buildSyntheticReplayKey({
        actorUserId: params.actorUserId,
        editionId: params.editionId,
        proposalFingerprint: params.proposalFingerprint,
      }),
      requestContext: {},
    };
  }

  it('returns duplicate for a committed replay claim with the same explicit key and fingerprint', async () => {
    const context = await seedApplyContext();
    const input = buildInput({
      ...context,
      proposalId: 'proposal-a',
      proposalFingerprint: 'fingerprint-a',
      idempotencyKey: 'idem-a',
    });

    const first = await testDb.transaction((tx) => claimApplyReplay({ input, tx }));
    const second = await testDb.transaction((tx) => claimApplyReplay({ input, tx }));

    expect(first).toEqual({ status: 'claimed' });
    expect(second).toEqual({ status: 'duplicate' });

    const rows = await testDb
      .select({ id: eventAiWizardApplyReplays.id })
      .from(eventAiWizardApplyReplays)
      .where(
        and(
          eq(eventAiWizardApplyReplays.actorUserId, context.actorUserId),
          eq(eventAiWizardApplyReplays.organizationId, context.organizationId),
          eq(eventAiWizardApplyReplays.editionId, context.editionId),
          eq(eventAiWizardApplyReplays.replayKey, input.replayKey),
        ),
      );

    expect(rows).toHaveLength(1);
  });

  it('returns conflict when the same explicit key is reused for a different fingerprint', async () => {
    const context = await seedApplyContext();
    const firstInput = buildInput({
      ...context,
      proposalId: 'proposal-a',
      proposalFingerprint: 'fingerprint-a',
      idempotencyKey: 'idem-shared',
    });
    const secondInput = buildInput({
      ...context,
      proposalId: 'proposal-b',
      proposalFingerprint: 'fingerprint-b',
      idempotencyKey: 'idem-shared',
    });

    const first = await testDb.transaction((tx) => claimApplyReplay({ input: firstInput, tx }));
    const second = await testDb.transaction((tx) => claimApplyReplay({ input: secondInput, tx }));

    expect(first).toEqual({ status: 'claimed' });
    expect(second).toEqual({
      status: 'conflict',
      existingProposalFingerprint: 'fingerprint-a',
      existingProposalId: 'proposal-a',
    });

    const rows = await testDb
      .select({ id: eventAiWizardApplyReplays.id })
      .from(eventAiWizardApplyReplays)
      .where(eq(eventAiWizardApplyReplays.replayKey, firstInput.replayKey));

    expect(rows).toHaveLength(1);
  });

  it('does not persist a replay claim after rollback and allows a clean retry', async () => {
    const context = await seedApplyContext();
    const input = buildInput({
      ...context,
      proposalId: 'proposal-rollback',
      proposalFingerprint: 'fingerprint-rollback',
      idempotencyKey: 'idem-rollback',
    });

    await expect(
      testDb.transaction(async (tx) => {
        const claimed = await claimApplyReplay({ input, tx });
        expect(claimed).toEqual({ status: 'claimed' });
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const replayAfterRollback = await getExistingApplyReplay({
      actorUserId: context.actorUserId,
      organizationId: context.organizationId,
      editionId: context.editionId,
      replayKey: input.replayKey,
    });

    expect(replayAfterRollback).toBeUndefined();

    const retry = await testDb.transaction((tx) => claimApplyReplay({ input, tx }));

    expect(retry).toEqual({ status: 'claimed' });
  });
});
