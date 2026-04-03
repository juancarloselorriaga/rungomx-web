import { resolve } from 'path';

import { and, eq } from 'drizzle-orm';

const mockCreateAuditLogDelegate = jest.fn();

jest.mock('@/lib/audit', () => {
  const actual = jest.requireActual('@/lib/audit') as typeof import('@/lib/audit');
  return {
    ...actual,
    createAuditLog: (...args: Parameters<typeof actual.createAuditLog>) =>
      mockCreateAuditLogDelegate(...args),
  };
});

import {
  auditLogs,
  eventAiWizardApplyReplays,
  eventDistances,
  eventEditions,
  eventFaqItems,
  eventPolicyConfigs,
  eventSeries,
  eventSlugRedirects,
  organizations,
  pricingTiers,
} from '@/db/schema';
import { applyAiWizardPatch } from '@/lib/events/ai-wizard/server/apply/apply-engine';
import {
  buildExplicitReplayKey,
  buildSyntheticReplayKey,
  fingerprintApplyCore,
} from '@/lib/events/ai-wizard/server/apply/idempotency';
import type {
  EventAiWizardApplyCore,
  EventAiWizardApplyEngineInput,
  EventAiWizardApplyEvent,
  EventAiWizardApplyPatch,
} from '@/lib/events/ai-wizard/server/apply/types';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';
import { createTestUser } from '@/tests/helpers/fixtures';
import { setupTestDatabaseEnv } from '@/testing/setup-db-env';

setupTestDatabaseEnv(resolve(process.cwd(), '.env.test'));

type CreateAuditLogArgs = Parameters<typeof import('@/lib/audit').createAuditLog>;

describe('ai wizard apply engine (database)', () => {
  const testDb = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
    const actualAudit = jest.requireActual('@/lib/audit') as typeof import('@/lib/audit');
    mockCreateAuditLogDelegate.mockReset();
    mockCreateAuditLogDelegate.mockImplementation((...args: CreateAuditLogArgs) =>
      actualAudit.createAuditLog(...args),
    );
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
  });

  async function seedEditionContext() {
    const user = await createTestUser(testDb, { emailVerified: true });

    const organizationId = '51000000-0000-4000-8000-000000000001';
    const seriesId = '52000000-0000-4000-8000-000000000001';
    const editionId = '53000000-0000-4000-8000-000000000001';

    await testDb.insert(organizations).values({
      id: organizationId,
      name: 'AI Wizard Engine Org',
      slug: 'ai-wizard-engine-org',
    });

    await testDb.insert(eventSeries).values({
      id: seriesId,
      organizationId,
      slug: 'ai-wizard-engine-series',
      name: 'AI Wizard Engine Series',
      sportType: 'running',
    });

    await testDb.insert(eventEditions).values({
      id: editionId,
      seriesId,
      editionLabel: '2026',
      publicCode: 'AIENG2026',
      slug: 'ai-engine-2026',
      timezone: 'America/Mexico_City',
      visibility: 'draft',
      country: 'MX',
    });

    const event: EventAiWizardApplyEvent = {
      id: editionId,
      publicCode: 'AIENG2026',
      slug: 'ai-engine-2026',
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
      seriesId,
      seriesName: 'AI Wizard Engine Series',
      seriesSlug: 'ai-wizard-engine-series',
      sportType: 'running',
      organizationId,
      organizationName: 'AI Wizard Engine Org',
      organizationSlug: 'ai-wizard-engine-org',
      distances: [],
      faqItems: [],
      waivers: [],
      policyConfig: null,
    };

    return {
      actorUserId: user.id,
      organizationId,
      seriesId,
      editionId,
      event,
    };
  }

  async function seedDistanceWithTier(params: {
    editionId: string;
    label?: string;
    priceCents?: number;
    startsAt?: Date | null;
    endsAt?: Date | null;
  }) {
    const [distance] = await testDb
      .insert(eventDistances)
      .values({
        editionId: params.editionId,
        label: params.label ?? '15K',
        distanceValue: '15',
        distanceUnit: 'km',
        kind: 'distance',
        capacityScope: 'per_distance',
        sortOrder: 0,
      })
      .returning();

    const [tier] = await testDb
      .insert(pricingTiers)
      .values({
        distanceId: distance.id,
        label: 'General',
        startsAt: params.startsAt ?? new Date('2026-03-01T00:00:00.000Z'),
        endsAt: params.endsAt ?? new Date('2026-03-31T23:59:59.000Z'),
        priceCents: params.priceCents ?? 15000,
        currency: 'MXN',
        sortOrder: 0,
      })
      .returning();

    return { distance, tier };
  }

  function buildInput(params: {
    actorUserId: string;
    organizationId: string;
    editionId: string;
    event: EventAiWizardApplyEvent;
    patch: EventAiWizardApplyPatch;
    proposalId?: string;
    idempotencyKey?: string;
  }): EventAiWizardApplyEngineInput {
    const core: EventAiWizardApplyCore = {
      title: params.patch.title,
      summary: params.patch.summary,
      risky: params.patch.risky,
      ops: params.patch.ops,
      markdownOutputs: params.patch.markdownOutputs,
    };

    const proposalFingerprint = fingerprintApplyCore(core);
    const replayKey = params.idempotencyKey
      ? buildExplicitReplayKey({
          actorUserId: params.actorUserId,
          editionId: params.editionId,
          idempotencyKey: params.idempotencyKey,
        })
      : buildSyntheticReplayKey({
          actorUserId: params.actorUserId,
          editionId: params.editionId,
          proposalFingerprint,
        });

    return {
      editionId: params.editionId,
      locale: 'es',
      actorUserId: params.actorUserId,
      organizationId: params.organizationId,
      event: params.event,
      patch: params.patch,
      core,
      proposalId: params.proposalId,
      proposalFingerprint,
      idempotencyKey: params.idempotencyKey,
      replayKey,
      replayKeyKind: params.idempotencyKey ? 'explicit' : 'synthetic',
      syntheticReplayKey: buildSyntheticReplayKey({
        actorUserId: params.actorUserId,
        editionId: params.editionId,
        proposalFingerprint,
      }),
      requestContext: {
        ipAddress: '127.0.0.1',
        userAgent: 'jest-db-test',
      },
    };
  }

  it('commits replay, domain writes, and redirects atomically for a successful apply', async () => {
    const context = await seedEditionContext();

    const patch: EventAiWizardApplyPatch = {
      title: 'Apply event updates',
      summary: 'Updates slug, FAQ, distance, and policy',
      ops: [
        {
          type: 'update_edition',
          editionId: context.editionId,
          data: { slug: 'ai-engine-2026-updated', city: 'Monterrey' },
        },
        {
          type: 'create_faq_item',
          editionId: context.editionId,
          data: {
            question: '¿Habrá abastecimientos?',
            answerMarkdown: 'Sí, en puntos marcados del recorrido.',
          },
        },
        {
          type: 'create_distance',
          editionId: context.editionId,
          data: {
            label: '30K',
            distanceValue: 30,
            distanceUnit: 'km',
            priceCents: 22000,
          },
        },
        {
          type: 'update_policy_config',
          editionId: context.editionId,
          data: {
            refundsAllowed: true,
            refundPolicyText: 'Reembolso disponible hasta 7 días antes.',
          },
        },
      ],
      markdownOutputs: [],
    };

    const input = buildInput({
      ...context,
      patch,
      proposalId: 'proposal-success',
      idempotencyKey: 'idem-success',
    });

    const result = await applyAiWizardPatch(input);

    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('applied');
    if (!result.ok || result.outcome !== 'applied') {
      throw new Error('Expected apply success');
    }
    expect(result.applied).toHaveLength(4);

    const [edition] = await testDb
      .select({ slug: eventEditions.slug, city: eventEditions.city })
      .from(eventEditions)
      .where(eq(eventEditions.id, context.editionId));
    expect(edition).toEqual({ slug: 'ai-engine-2026-updated', city: 'Monterrey' });

    const faqRows = await testDb
      .select({ question: eventFaqItems.question })
      .from(eventFaqItems)
      .where(eq(eventFaqItems.editionId, context.editionId));
    expect(faqRows).toEqual([{ question: '¿Habrá abastecimientos?' }]);

    const distanceRows = await testDb
      .select({ id: eventDistances.id, label: eventDistances.label })
      .from(eventDistances)
      .where(eq(eventDistances.editionId, context.editionId));
    expect(distanceRows).toHaveLength(1);
    expect(distanceRows[0]?.label).toBe('30K');

    const tierRows = await testDb
      .select({ priceCents: pricingTiers.priceCents })
      .from(pricingTiers)
      .where(eq(pricingTiers.distanceId, distanceRows[0]!.id));
    expect(tierRows).toEqual([{ priceCents: 22000 }]);

    const [policy] = await testDb
      .select({
        refundsAllowed: eventPolicyConfigs.refundsAllowed,
        refundPolicyText: eventPolicyConfigs.refundPolicyText,
      })
      .from(eventPolicyConfigs)
      .where(eq(eventPolicyConfigs.editionId, context.editionId));
    expect(policy).toEqual({
      refundsAllowed: true,
      refundPolicyText: 'Reembolso disponible hasta 7 días antes.',
    });

    const redirectRows = await testDb
      .select({ fromEditionSlug: eventSlugRedirects.fromEditionSlug, toEditionSlug: eventSlugRedirects.toEditionSlug })
      .from(eventSlugRedirects)
      .where(eq(eventSlugRedirects.fromEditionSlug, 'ai-engine-2026'));
    expect(redirectRows).toEqual([
      { fromEditionSlug: 'ai-engine-2026', toEditionSlug: 'ai-engine-2026-updated' },
    ]);

    const replayRows = await testDb
      .select({ id: eventAiWizardApplyReplays.id })
      .from(eventAiWizardApplyReplays)
      .where(eq(eventAiWizardApplyReplays.editionId, context.editionId));
    expect(replayRows).toHaveLength(1);

    const auditRows = await testDb
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, context.actorUserId));
    expect(auditRows.some((row) => row.action === 'event_ai_wizard.apply')).toBe(true);
    expect(auditRows.some((row) => row.action === 'faq.create')).toBe(true);
  });

  it('rolls back earlier writes and replay claim when a later op fails, then allows retry', async () => {
    const context = await seedEditionContext();

    const failingPatch: EventAiWizardApplyPatch = {
      title: 'Apply with late audit failure',
      summary: 'Creates FAQ then fails during a later audit write',
      ops: [
        {
          type: 'create_faq_item',
          editionId: context.editionId,
          data: {
            question: '¿Hay medalla?',
            answerMarkdown: 'Sí, para finalistas.',
          },
        },
        {
          type: 'create_waiver',
          editionId: context.editionId,
          data: {
            title: 'Responsiva obligatoria',
            bodyMarkdown: 'Debes aceptar la responsiva para participar.',
          },
        },
      ],
      markdownOutputs: [],
    };

    mockCreateAuditLogDelegate.mockImplementation(async (...args: CreateAuditLogArgs) => {
      const actualAudit = jest.requireActual('@/lib/audit') as typeof import('@/lib/audit');
      const payload = args[0] as { action?: string };
      if (payload?.action === 'waiver.create') {
        return { ok: false, error: 'forced waiver audit failure' };
      }

      return actualAudit.createAuditLog(...args);
    });

    const failingInput = buildInput({
      ...context,
      patch: failingPatch,
      proposalId: 'proposal-failure',
      idempotencyKey: 'idem-failure',
    });

    const failedResult = await applyAiWizardPatch(failingInput);

    expect(failedResult).toMatchObject({
      ok: false,
      outcome: 'rejected',
      code: 'RETRY_LATER',
      failedOpIndex: 1,
    });

    const faqAfterFailure = await testDb
      .select({ id: eventFaqItems.id })
      .from(eventFaqItems)
      .where(eq(eventFaqItems.editionId, context.editionId));
    expect(faqAfterFailure).toHaveLength(0);

    const replayAfterFailure = await testDb
      .select({ id: eventAiWizardApplyReplays.id })
      .from(eventAiWizardApplyReplays)
      .where(eq(eventAiWizardApplyReplays.replayKey, failingInput.replayKey));
    expect(replayAfterFailure).toHaveLength(0);

    const auditAfterFailure = await testDb
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, context.actorUserId));
    expect(auditAfterFailure).toHaveLength(0);

    const retryPatch: EventAiWizardApplyPatch = {
      ...failingPatch,
      ops: [
        failingPatch.ops[0],
        {
          type: 'create_waiver',
          editionId: context.editionId,
          data: {
            title: 'Responsiva actualizada',
            bodyMarkdown: 'Acepta la responsiva actualizada para participar.',
          },
        },
      ],
    };

    const actualAudit = jest.requireActual('@/lib/audit') as typeof import('@/lib/audit');
    mockCreateAuditLogDelegate.mockImplementation((...args: CreateAuditLogArgs) =>
      actualAudit.createAuditLog(...args),
    );

    const retryInput = buildInput({
      ...context,
      patch: retryPatch,
      proposalId: 'proposal-retry',
      idempotencyKey: 'idem-failure',
    });

    const retryResult = await applyAiWizardPatch(retryInput);
    expect(retryResult).toMatchObject({ ok: true, outcome: 'applied' });

    const faqAfterRetry = await testDb
      .select({ question: eventFaqItems.question })
      .from(eventFaqItems)
      .where(eq(eventFaqItems.editionId, context.editionId));
    expect(faqAfterRetry).toEqual([{ question: '¿Hay medalla?' }]);

    const replayAfterRetry = await testDb
      .select({ id: eventAiWizardApplyReplays.id })
      .from(eventAiWizardApplyReplays)
      .where(eq(eventAiWizardApplyReplays.replayKey, retryInput.replayKey));
    expect(replayAfterRetry).toHaveLength(1);
  });

  it('returns duplicate after a committed apply and writes nothing extra', async () => {
    const context = await seedEditionContext();

    const patch: EventAiWizardApplyPatch = {
      title: 'Duplicate apply test',
      summary: 'Creates one FAQ item',
      ops: [
        {
          type: 'create_faq_item',
          editionId: context.editionId,
          data: {
            question: '¿Hay guardarropa?',
            answerMarkdown: 'Sí, cerca de salida/meta.',
          },
        },
      ],
      markdownOutputs: [],
    };

    const input = buildInput({
      ...context,
      patch,
      proposalId: 'proposal-duplicate',
      idempotencyKey: 'idem-duplicate',
    });

    const first = await applyAiWizardPatch(input);
    const faqCountAfterFirst = await testDb
      .select({ id: eventFaqItems.id })
      .from(eventFaqItems)
      .where(eq(eventFaqItems.editionId, context.editionId));
    const replayCountAfterFirst = await testDb
      .select({ id: eventAiWizardApplyReplays.id })
      .from(eventAiWizardApplyReplays)
      .where(eq(eventAiWizardApplyReplays.replayKey, input.replayKey));
    const auditCountAfterFirst = await testDb
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, context.actorUserId));

    const second = await applyAiWizardPatch(input);
    const faqCountAfterSecond = await testDb
      .select({ id: eventFaqItems.id })
      .from(eventFaqItems)
      .where(eq(eventFaqItems.editionId, context.editionId));
    const replayCountAfterSecond = await testDb
      .select({ id: eventAiWizardApplyReplays.id })
      .from(eventAiWizardApplyReplays)
      .where(eq(eventAiWizardApplyReplays.replayKey, input.replayKey));
    const auditCountAfterSecond = await testDb
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, context.actorUserId));

    expect(first).toMatchObject({ ok: true, outcome: 'applied' });
    expect(second).toEqual({
      ok: true,
      outcome: 'duplicate',
      duplicate: true,
      applied: [],
      proposalFingerprint: input.proposalFingerprint,
      proposalId: 'proposal-duplicate',
    });
    expect(faqCountAfterFirst).toHaveLength(1);
    expect(faqCountAfterSecond).toHaveLength(1);
    expect(replayCountAfterFirst).toHaveLength(1);
    expect(replayCountAfterSecond).toHaveLength(1);
    expect(auditCountAfterSecond).toHaveLength(auditCountAfterFirst.length);
  });
});
