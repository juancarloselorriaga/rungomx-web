const mockRequireAuthenticatedUser = jest.fn();
const mockRequireProFeature = jest.fn();
const mockGetEventEditionDetail = jest.fn();
const mockCanUserAccessSeries = jest.fn();
const mockHeaders = jest.fn();
const mockTrackProFeatureEvent = jest.fn();
const mockCreateAuditLog = jest.fn();
const mockEvaluateAiWizardPatchSafety = jest.fn();
const mockClaimApplyReplay = jest.fn();
const mockGetExistingApplyReplay = jest.fn();
const mockPersistenceCreateDistance = jest.fn();
const mockPersistenceCreateFaqItem = jest.fn();
const mockPersistenceCreatePricingTier = jest.fn();
const mockPersistenceCreateQuestion = jest.fn();
const mockPersistenceCreateWaiver = jest.fn();
const mockPersistenceGetWebsiteContent = jest.fn();
const mockPersistenceUpdateDistancePrice = jest.fn();
const mockPersistenceUpdateEventEdition = jest.fn();
const mockPersistenceUpdateEventPolicyConfig = jest.fn();
const mockPersistenceUpdateWebsiteContent = jest.fn();
const mockDbSelectWhere = jest.fn();
const mockDbSelectLimit = jest.fn();
const mockFindExistingEdition = jest.fn();
const mockFindPricingTiers = jest.fn();
const mockDbTransaction = jest.fn();
const mockTxEventEditionsFindFirst = jest.fn();
const mockTxEventDistancesFindMany = jest.fn();
const mockTxEventFaqItemsFindMany = jest.fn();
const mockTxWaiversFindMany = jest.fn();
const mockTxEventWebsiteContentFindFirst = jest.fn();
const mockTxEventPolicyConfigsFindFirst = jest.fn();
const mockTxEventDistancesFindFirst = jest.fn();
const mockTxPricingTiersFindMany = jest.fn();
const mockTxInsertReturning = jest.fn();
const mockTxUpdateReturning = jest.fn();
const mockTxInsertValues = jest.fn();
const mockTxUpdateSet = jest.fn();

const transactionClient = {
  query: {
    eventEditions: {
      findFirst: (...args: unknown[]) => mockTxEventEditionsFindFirst(...args),
    },
    eventDistances: {
      findMany: (...args: unknown[]) => mockTxEventDistancesFindMany(...args),
      findFirst: (...args: unknown[]) => mockTxEventDistancesFindFirst(...args),
    },
    eventFaqItems: {
      findMany: (...args: unknown[]) => mockTxEventFaqItemsFindMany(...args),
    },
    waivers: {
      findMany: (...args: unknown[]) => mockTxWaiversFindMany(...args),
    },
    eventWebsiteContent: {
      findFirst: (...args: unknown[]) => mockTxEventWebsiteContentFindFirst(...args),
    },
    eventPolicyConfigs: {
      findFirst: (...args: unknown[]) => mockTxEventPolicyConfigsFindFirst(...args),
    },
    pricingTiers: {
      findMany: (...args: unknown[]) => mockTxPricingTiersFindMany(...args),
    },
  },
  insert: jest.fn(() => ({
    values: (...args: unknown[]) => {
      mockTxInsertValues(...args);
      return {
        returning: (...returningArgs: unknown[]) => mockTxInsertReturning(...returningArgs),
        onConflictDoNothing: () => ({
          returning: (...returningArgs: unknown[]) => mockTxInsertReturning(...returningArgs),
        }),
      };
    },
  })),
  update: jest.fn(() => ({
    set: (...args: unknown[]) => {
      mockTxUpdateSet(...args);
      return {
        where: () => ({
          returning: (...returningArgs: unknown[]) => mockTxUpdateReturning(...returningArgs),
        }),
      };
    },
  })),
};

function createAwaitableQuery<TValue>(value: TValue, extras?: Record<string, unknown>) {
  const promise = Promise.resolve(value);
  return {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    ...extras,
  };
}

jest.mock('@/lib/auth/guards', () => ({
  requireAuthenticatedUser: (...args: unknown[]) => mockRequireAuthenticatedUser(...args),
}));

jest.mock('@/lib/pro-features/server/guard', () => ({
  ProFeatureAccessError: class ProFeatureAccessError extends Error {
    decision: { status: 'disabled' | 'blocked' };

    constructor(status: 'disabled' | 'blocked' = 'blocked') {
      super('blocked');
      this.decision = { status };
    }
  },
  requireProFeature: (...args: unknown[]) => mockRequireProFeature(...args),
}));

jest.mock('@/lib/events/queries', () => ({
  getEventEditionDetail: (...args: unknown[]) => mockGetEventEditionDetail(...args),
}));

jest.mock('@/db', () => ({
  db: {
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
    query: {
      eventEditions: {
        findFirst: (...args: unknown[]) => mockFindExistingEdition(...args),
      },
      pricingTiers: {
        findMany: (...args: unknown[]) => mockFindPricingTiers(...args),
      },
    },
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: (...args: unknown[]) =>
          createAwaitableQuery(mockDbSelectWhere(...args), {
            orderBy: (...orderByArgs: unknown[]) => ({
              limit: (...limitArgs: unknown[]) => mockDbSelectLimit(...orderByArgs, ...limitArgs),
            }),
          }),
      })),
    })),
  },
}));

jest.mock('@/lib/audit', () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
  getRequestContext: jest.fn(async () => ({})),
}));

jest.mock('@/lib/events/ai-wizard/server/apply/replay-store', () => ({
  claimApplyReplay: (...args: unknown[]) => mockClaimApplyReplay(...args),
  getExistingApplyReplay: (...args: unknown[]) => mockGetExistingApplyReplay(...args),
}));

jest.mock('@/lib/events/ai-wizard/server/apply/persistence', () => ({
  createDistance: (...args: unknown[]) => mockPersistenceCreateDistance(...args),
  createFaqItem: (...args: unknown[]) => mockPersistenceCreateFaqItem(...args),
  createPricingTier: (...args: unknown[]) => mockPersistenceCreatePricingTier(...args),
  createQuestion: (...args: unknown[]) => mockPersistenceCreateQuestion(...args),
  createWaiver: (...args: unknown[]) => mockPersistenceCreateWaiver(...args),
  getWebsiteContent: (...args: unknown[]) => mockPersistenceGetWebsiteContent(...args),
  updateDistancePrice: (...args: unknown[]) => mockPersistenceUpdateDistancePrice(...args),
  updateEventEdition: (...args: unknown[]) => mockPersistenceUpdateEventEdition(...args),
  updateEventPolicyConfig: (...args: unknown[]) => mockPersistenceUpdateEventPolicyConfig(...args),
  updateWebsiteContent: (...args: unknown[]) => mockPersistenceUpdateWebsiteContent(...args),
}));

jest.mock('@/lib/events/ai-wizard/safety', () => ({
  evaluateAiWizardPatchSafety: (...args: unknown[]) => mockEvaluateAiWizardPatchSafety(...args),
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({
    allowed: true,
    remaining: 1,
    resetAt: new Date('2026-03-11T00:00:00.000Z'),
  })),
}));

jest.mock('@/lib/pro-features/server/tracking', () => ({
  trackProFeatureEvent: (...args: unknown[]) => mockTrackProFeatureEvent(...args),
}));

jest.mock('@/lib/organizations/permissions', () => {
  const actual = jest.requireActual('@/lib/organizations/permissions');
  return {
    ...actual,
    canUserAccessSeries: (...args: unknown[]) => mockCanUserAccessSeries(...args),
  };
});

jest.mock('next/headers', () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

import { POST } from '@/app/api/events/ai-wizard/apply/route';
import {
  buildApplyCoreFromPatch,
  fingerprintApplyCore,
} from '@/lib/events/ai-wizard/server/apply/idempotency';
import type { EventAiWizardApplyRequest } from '@/lib/events/ai-wizard/schemas';
import { checkRateLimit } from '@/lib/rate-limit';

describe('POST /api/events/ai-wizard/apply', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockRequireProFeature.mockReset();
    mockGetEventEditionDetail.mockReset();
    mockCanUserAccessSeries.mockReset();
    mockTrackProFeatureEvent.mockReset();
    mockCreateAuditLog.mockReset();
    mockEvaluateAiWizardPatchSafety.mockReset();
    mockClaimApplyReplay.mockReset();
    mockGetExistingApplyReplay.mockReset();
    mockPersistenceCreateDistance.mockReset();
    mockPersistenceCreateFaqItem.mockReset();
    mockPersistenceCreatePricingTier.mockReset();
    mockPersistenceCreateQuestion.mockReset();
    mockPersistenceCreateWaiver.mockReset();
    mockPersistenceGetWebsiteContent.mockReset();
    mockPersistenceUpdateDistancePrice.mockReset();
    mockPersistenceUpdateEventEdition.mockReset();
    mockPersistenceUpdateEventPolicyConfig.mockReset();
    mockPersistenceUpdateWebsiteContent.mockReset();
    mockDbSelectWhere.mockReset();
    mockDbSelectLimit.mockReset();
    mockFindExistingEdition.mockReset();
    mockFindPricingTiers.mockReset();
    mockDbTransaction.mockReset();
    mockTxEventEditionsFindFirst.mockReset();
    mockTxEventDistancesFindMany.mockReset();
    mockTxEventFaqItemsFindMany.mockReset();
    mockTxWaiversFindMany.mockReset();
    mockTxEventWebsiteContentFindFirst.mockReset();
    mockTxEventPolicyConfigsFindFirst.mockReset();
    mockTxEventDistancesFindFirst.mockReset();
    mockTxPricingTiersFindMany.mockReset();
    mockTxInsertReturning.mockReset();
    mockTxUpdateReturning.mockReset();
    mockTxInsertValues.mockReset();
    mockTxUpdateSet.mockReset();
    (checkRateLimit as jest.Mock).mockReset();

    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false, canViewOrganizersDashboard: true },
    });
    mockHeaders.mockResolvedValue(new Headers());
    mockRequireProFeature.mockResolvedValue(undefined);
    mockTrackProFeatureEvent.mockResolvedValue(undefined);
    mockCreateAuditLog.mockResolvedValue({ ok: true, auditLogId: 'audit-1' });
    mockEvaluateAiWizardPatchSafety.mockReturnValue({ blocked: false });
    mockClaimApplyReplay.mockResolvedValue({ status: 'claimed' });
    mockGetExistingApplyReplay.mockResolvedValue(undefined);
    mockPersistenceCreateDistance.mockResolvedValue({ ok: true, data: { id: 'distance-1' } });
    mockPersistenceCreateFaqItem.mockResolvedValue({ ok: true, data: { id: 'faq-1' } });
    mockPersistenceCreatePricingTier.mockResolvedValue({ ok: true, data: { id: 'tier-1' } });
    mockPersistenceCreateQuestion.mockResolvedValue({ ok: true, data: { id: 'question-1' } });
    mockPersistenceCreateWaiver.mockResolvedValue({ ok: true, data: { id: 'waiver-1' } });
    mockPersistenceGetWebsiteContent.mockResolvedValue({
      ok: true,
      data: {
        id: 'content-1',
        editionId: '11111111-1111-4111-8111-111111111111',
        locale: 'es',
        blocks: {},
      },
    });
    mockPersistenceUpdateDistancePrice.mockResolvedValue({ ok: true, data: undefined });
    mockPersistenceUpdateEventEdition.mockResolvedValue({ ok: true, data: { id: 'edition-1' } });
    mockPersistenceUpdateEventPolicyConfig.mockResolvedValue({
      ok: true,
      data: {
        refundsAllowed: true,
        refundPolicyText: null,
        refundDeadline: null,
        transfersAllowed: false,
        transferPolicyText: null,
        transferDeadline: null,
        deferralsAllowed: false,
        deferralPolicyText: null,
        deferralDeadline: null,
      },
    });
    mockPersistenceUpdateWebsiteContent.mockResolvedValue({
      ok: true,
      data: { id: 'content-1' },
    });
    mockDbSelectWhere.mockResolvedValue([]);
    mockDbSelectLimit.mockResolvedValue([]);
    mockFindExistingEdition.mockResolvedValue(null);
    mockFindPricingTiers.mockResolvedValue([]);
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
    );
    mockTxEventEditionsFindFirst.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'edition-2026',
      seriesId: 'series-1',
      sharedCapacity: null,
      deletedAt: null,
      series: {
        id: 'series-1',
        slug: 'series-trail',
        organizationId: 'org-1',
      },
    });
    mockTxEventDistancesFindMany.mockResolvedValue([]);
    mockTxEventFaqItemsFindMany.mockResolvedValue([]);
    mockTxWaiversFindMany.mockResolvedValue([]);
    mockTxEventWebsiteContentFindFirst.mockResolvedValue(null);
    mockTxEventPolicyConfigsFindFirst.mockResolvedValue(null);
    mockTxEventDistancesFindFirst.mockResolvedValue({ id: 'distance-1', pricingTiers: [] });
    mockTxPricingTiersFindMany.mockResolvedValue([]);
    mockTxInsertReturning.mockResolvedValue([{ id: 'inserted-1' }]);
    mockTxUpdateReturning.mockResolvedValue([{ id: 'updated-1' }]);
    (checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      remaining: 1,
      resetAt: new Date('2026-03-11T00:00:00.000Z'),
    });
    mockGetEventEditionDetail.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      seriesId: 'series-1',
      slug: 'edition-2026',
      timezone: 'America/Mexico_City',
      organizerBrief: null,
      policyConfig: null,
      faqItems: [],
      waivers: [],
      distances: [],
    });
  });

  function buildFaqApplyBody(): EventAiWizardApplyRequest {
    return {
      editionId: '11111111-1111-4111-8111-111111111111',
      locale: 'es',
      patch: {
        title: 'Create FAQ',
        summary: 'Adds one FAQ item.',
        ops: [
          {
            type: 'create_faq_item',
            editionId: '11111111-1111-4111-8111-111111111111',
            data: {
              question: 'What is included?',
              answerMarkdown: 'Trail access and timing support.',
            },
          },
        ],
        markdownOutputs: [
          {
            domain: 'faq',
            contentMarkdown: 'Trail access and timing support.',
          },
        ],
      },
    };
  }

  function buildFaqFingerprint() {
    return fingerprintApplyCore(buildApplyCoreFromPatch(buildFaqApplyBody().patch));
  }

  it('returns INVALID_BODY for malformed requests before any auth or apply work', async () => {
    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({ editionId: 'bad-id' }),
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('INVALID_BODY');
    expect(mockRequireAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('returns UNAUTHENTICATED when the auth guard rejects the request', async () => {
    mockRequireAuthenticatedUser.mockRejectedValueOnce(new Error('auth'));

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify(buildFaqApplyBody()),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'UNAUTHENTICATED' });
  });

  it('returns FORBIDDEN when the user has no access to the event series', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce(null);

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify(buildFaqApplyBody()),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'FORBIDDEN' });
    expect(mockClaimApplyReplay).not.toHaveBeenCalled();
  });

  it('returns RATE_LIMITED and tracks the blocked usage when the apply rate limit is exceeded', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });
    (checkRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date('2026-03-11T00:00:00.000Z'),
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify(buildFaqApplyBody()),
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      code: 'RATE_LIMITED',
      category: 'rate_limit',
      endpoint: 'apply',
      resetAt: '2026-03-11T00:00:00.000Z',
    });
    expect(mockTrackProFeatureEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'blocked' }),
    );
  });

  it('returns duplicate before rate limiting for a replayed apply retry', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });
    mockGetExistingApplyReplay.mockResolvedValueOnce({
      proposalFingerprint: buildFaqFingerprint(),
      proposalId: 'proposal-duplicate',
    });
    (checkRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date('2026-03-11T00:00:00.000Z'),
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          ...buildFaqApplyBody(),
          proposalId: 'proposal-duplicate',
          idempotencyKey: 'idem-duplicate',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, applied: [], duplicate: true });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(mockClaimApplyReplay).not.toHaveBeenCalled();
  });

  it('returns SAFETY_BLOCKED when patch safety blocks the apply request', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });
    mockEvaluateAiWizardPatchSafety.mockReturnValueOnce({
      blocked: true,
      category: 'prompt_injection',
      reason: 'assistant_attack',
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify(buildFaqApplyBody()),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: 'SAFETY_BLOCKED',
      category: 'prompt_injection',
      reason: 'assistant_attack',
      endpoint: 'apply',
    });
  });

  it('maps invalid referenced distances to the legacy INVALID_DISTANCE envelope', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });
    mockDbSelectWhere.mockResolvedValueOnce([]);

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Create pricing tier',
            summary: 'Uses an invalid distance reference.',
            ops: [
              {
                type: 'create_pricing_tier',
                distanceId: '22222222-2222-4222-8222-222222222222',
                data: { label: 'Early bird', price: 199 },
              },
            ],
            markdownOutputs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'INVALID_DISTANCE',
      details: { distanceId: '22222222-2222-4222-8222-222222222222' },
    });
  });

  it('returns INVALID_PATCH when a location choice is required but missing', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Confirm location',
            summary: 'Needs a chosen location.',
            ops: [
              {
                type: 'update_edition',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  locationDisplay: 'Chapultepec',
                },
              },
            ],
            markdownOutputs: [],
            choiceRequest: {
              kind: 'location_candidate_selection',
              selectionMode: 'single',
              sourceStepId: 'basics',
              targetField: 'event_location',
              query: 'Chapultepec',
              options: [
                {
                  lat: 19.4204,
                  lng: -99.1821,
                  formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
                  city: 'Ciudad de México',
                  region: 'Ciudad de México',
                  placeId: 'mapbox-1',
                  provider: 'mapbox',
                },
              ],
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: 'INVALID_PATCH',
      details: { reason: 'MISSING_LOCATION_CHOICE' },
      applied: [],
    });
  });

  it('rejects an explicitly supplied proposalFingerprint when it does not match the server fingerprint', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          ...buildFaqApplyBody(),
          proposalFingerprint: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'INVALID_PATCH',
      details: {
        reason: 'PROPOSAL_FINGERPRINT_MISMATCH',
        proposalFingerprint: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      },
      applied: [],
    });
    expect(mockPersistenceCreateFaqItem).not.toHaveBeenCalled();
  });

  it('accepts additive proposal identity fields and forwards duplicate-safe replay metadata', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          ...buildFaqApplyBody(),
          proposalId: 'proposal-123',
          idempotencyKey: 'idem-apply-123',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      applied: [
        {
          opIndex: 0,
          type: 'create_faq_item',
          result: { id: 'faq-1' },
        },
      ],
    });
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          aiWizardApply: expect.objectContaining({
            proposalId: 'proposal-123',
            idempotencyKey: 'idem-apply-123',
            replayKeyKind: 'explicit',
            replayKey: expect.any(String),
            syntheticReplayKey: expect.any(String),
          }),
        }),
      }),
      expect.anything(),
    );
    expect(mockTrackProFeatureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'used',
        meta: expect.objectContaining({
          proposalId: 'proposal-123',
          replayKeyKind: 'explicit',
          duplicate: false,
        }),
      }),
    );
  });

  it('returns a deterministic duplicate apply response when the replay key was already claimed', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });
    mockGetExistingApplyReplay.mockResolvedValueOnce({
      proposalFingerprint: buildFaqFingerprint(),
      proposalId: 'proposal-duplicate',
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          ...buildFaqApplyBody(),
          proposalId: 'proposal-duplicate',
          idempotencyKey: 'idem-duplicate',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, applied: [], duplicate: true });
    expect(mockGetExistingApplyReplay).toHaveBeenCalled();
    expect(mockCreateAuditLog).not.toHaveBeenCalled();
    expect(mockTrackProFeatureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'used',
        meta: expect.objectContaining({
          outcome: 'duplicate',
          duplicate: true,
          proposalId: 'proposal-duplicate',
          replayKeyKind: 'explicit',
          appliedCount: 0,
        }),
      }),
    );
  });

  it('returns conflict when an explicit idempotency key is reused with a different patch fingerprint', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });
    mockGetExistingApplyReplay.mockResolvedValueOnce({
      proposalFingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      proposalId: 'proposal-existing',
    });
    (checkRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date('2026-03-11T00:00:00.000Z'),
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          ...buildFaqApplyBody(),
          proposalId: 'proposal-next',
          idempotencyKey: 'idem-reused',
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'INVALID_PATCH',
      details: {
        reason: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PATCH',
        existingProposalFingerprint:
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        existingProposalId: 'proposal-existing',
      },
      applied: [],
    });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(mockClaimApplyReplay).not.toHaveBeenCalled();
    expect(mockTrackProFeatureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'blocked',
        meta: expect.objectContaining({
          endpoint: 'apply',
          outcome: 'rejected',
          code: 'IDEMPOTENCY_KEY_REUSED',
          proposalId: 'proposal-next',
          replayKeyKind: 'explicit',
        }),
      }),
    );
  });

  it('applies a selected location choice server-side without mutating the client patch', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          locationChoice: { optionIndex: 0 },
          patch: {
            title: 'Confirm location',
            summary: 'Needs a chosen location.',
            ops: [
              {
                type: 'update_edition',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  locationDisplay: 'Chapultepec',
                },
              },
            ],
            markdownOutputs: [],
            choiceRequest: {
              kind: 'location_candidate_selection',
              selectionMode: 'single',
              sourceStepId: 'basics',
              targetField: 'event_location',
              query: 'Chapultepec',
              options: [
                {
                  lat: 19.4204,
                  lng: -99.1821,
                  formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
                  address: 'Gran Avenida, 11580 Ciudad de México, México',
                  city: 'Ciudad de México',
                  region: 'Ciudad de México',
                  countryCode: 'MX',
                  placeId: 'mapbox-1',
                  provider: 'mapbox',
                },
              ],
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPersistenceUpdateEventEdition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        locationDisplay: 'Bosque de Chapultepec, Ciudad de México, México',
        address: 'Gran Avenida, 11580 Ciudad de México, México',
        city: 'Ciudad de México',
        state: 'Ciudad de México',
        country: 'MX',
        latitude: '19.4204',
        longitude: '-99.1821',
      }),
    );
    expect(mockTrackProFeatureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        featureKey: 'event_ai_wizard',
        userId: 'user-1',
        eventType: 'used',
        meta: expect.objectContaining({
          endpoint: 'apply',
          outcome: 'applied',
          editionId: '11111111-1111-4111-8111-111111111111',
          proposalFingerprint: expect.any(String),
          opCount: 1,
          appliedCount: 1,
          hadLocationChoice: true,
          hadChoiceRequest: true,
        }),
      }),
    );
  });

  it('returns INVALID_PATCH for malformed non-ambiguous distance start times', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Crear la primera distancia',
            summary: 'No acepta fechas inválidas.',
            ops: [
              {
                type: 'create_distance',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  label: '10K',
                  distanceValue: 10,
                  distanceUnit: 'km',
                  startTimeLocal: 'not-a-date',
                  price: 350,
                },
              },
            ],
            markdownOutputs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: 'INVALID_PATCH',
      details: { opIndex: 0, reason: 'INVALID_DATETIME' },
      applied: [],
    });
  });

  it('maps engine READ_ONLY failures from op execution back to the HTTP adapter', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });
    mockPersistenceCreateDistance.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Crear la primera distancia',
            summary: 'La acción devuelve forbidden.',
            ops: [
              {
                type: 'create_distance',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  label: '10K',
                  distanceValue: 10,
                  distanceUnit: 'km',
                  price: 350,
                },
              },
            ],
            markdownOutputs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: 'READ_ONLY',
      details: { opIndex: 0, operation: 'create_distance' },
      applied: [],
    });
    expect(mockTrackProFeatureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        featureKey: 'event_ai_wizard',
        userId: 'user-1',
        eventType: 'blocked',
        meta: expect.objectContaining({
          endpoint: 'apply',
          outcome: 'rejected',
          editionId: '11111111-1111-4111-8111-111111111111',
          proposalFingerprint: expect.any(String),
          code: 'READ_ONLY',
          failedOpIndex: 0,
          appliedCount: 0,
          hadLocationChoice: false,
        }),
      }),
    );
  });

  it('maps engine RETRY_LATER failures from op execution back to the HTTP adapter', async () => {
    mockCanUserAccessSeries.mockResolvedValueOnce({ organizationId: 'org-1', role: 'owner' });
    mockPersistenceCreateDistance.mockResolvedValueOnce({ ok: false, code: 'SERVER_ERROR' });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Crear la primera distancia',
            summary: 'La acción devuelve server error.',
            ops: [
              {
                type: 'create_distance',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  label: '10K',
                  distanceValue: 10,
                  distanceUnit: 'km',
                  price: 350,
                },
              },
            ],
            markdownOutputs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: 'RETRY_LATER',
      details: { opIndex: 0, operation: 'create_distance' },
      applied: [],
    });
  });

  it('drops ambiguous human-readable distance start times instead of failing apply', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Crear la primera distancia',
            summary: 'Agrega la primera distancia sin inventar un horario inválido.',
            ops: [
              {
                type: 'create_distance',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  label: '10K',
                  distanceValue: 10,
                  distanceUnit: 'km',
                  startTimeLocal: '7:00 a.m.',
                  price: 350,
                },
              },
            ],
            markdownOutputs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      applied: [
        {
          opIndex: 0,
          type: 'create_distance',
          result: { id: 'distance-1' },
        },
      ],
    });
    expect(mockPersistenceCreateDistance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        label: '10K',
        startTimeLocal: undefined,
      }),
    );
  });

  it('still applies distance patches with no start time', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Crear la primera distancia',
            summary: 'Agrega la primera distancia con los datos confirmados.',
            ops: [
              {
                type: 'create_distance',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  label: '5K',
                  distanceValue: 5,
                  distanceUnit: 'km',
                  price: 250,
                },
              },
            ],
            markdownOutputs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPersistenceCreateDistance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        label: '5K',
        startTimeLocal: undefined,
      }),
    );
  });

  it('preserves valid machine-usable distance start times through apply', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Crear la primera distancia',
            summary: 'Agrega la primera distancia con un horario válido.',
            ops: [
              {
                type: 'create_distance',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  label: '21K',
                  distanceValue: 21,
                  distanceUnit: 'km',
                  startTimeLocal: '2026-03-29T13:00:00.000Z',
                  price: 550,
                },
              },
            ],
            markdownOutputs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPersistenceCreateDistance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        label: '21K',
        startTimeLocal: '2026-03-29T13:00:00.000Z',
      }),
    );
  });

  it('returns READ_ONLY for viewer memberships before applying assistant changes', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'viewer',
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Create FAQ',
            summary: 'Adds one FAQ item.',
            ops: [
              {
                type: 'create_faq_item',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  question: 'What is included?',
                  answerMarkdown: 'Trail access and timing support.',
                },
              },
            ],
            markdownOutputs: [
              {
                domain: 'faq',
                contentMarkdown: 'Trail access and timing support.',
              },
            ],
          },
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'READ_ONLY' });
    expect(mockClaimApplyReplay).not.toHaveBeenCalled();
  });

  it('returns FEATURE_DISABLED when the shared Pro-feature guard disables apply', async () => {
    const { ProFeatureAccessError } = jest.requireMock('@/lib/pro-features/server/guard');
    mockRequireProFeature.mockRejectedValueOnce(new ProFeatureAccessError('disabled'));

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Create a distance',
            summary: 'Valid payload for the guard check.',
            ops: [
              {
                type: 'create_distance',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  label: '5K',
                  distanceValue: 5,
                  distanceUnit: 'km',
                  price: 250,
                },
              },
            ],
            markdownOutputs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'FEATURE_DISABLED' });
  });

  it('applies a deterministic policy-config update patch in one write', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });
    mockGetEventEditionDetail.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      seriesId: 'series-1',
      organizerBrief: null,
      faqItems: [],
      waivers: [],
      distances: [],
      policyConfig: {
        refundsAllowed: true,
        refundPolicyText: 'Texto anterior',
        refundDeadline: null,
        transfersAllowed: false,
        transferPolicyText: null,
        transferDeadline: null,
        deferralsAllowed: false,
        deferralPolicyText: null,
        deferralDeadline: null,
      },
    });
    mockPersistenceUpdateEventPolicyConfig.mockResolvedValue({
      ok: true,
      data: {
        refundsAllowed: true,
        refundPolicyText: '### Reembolsos',
        refundDeadline: '2026-03-15T00:00:00.000Z',
        transfersAllowed: true,
        transferPolicyText: '### Transferencias',
        transferDeadline: '2026-03-22T00:00:00.000Z',
        deferralsAllowed: false,
        deferralPolicyText: '### Diferimientos',
        deferralDeadline: null,
      },
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Aclarar políticas para participantes',
            summary: 'Reescribe las políticas con fechas y reglas confirmadas.',
            ops: [
              {
                type: 'update_policy_config',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  refundsAllowed: true,
                  refundPolicyText: '### Reembolsos',
                  refundDeadline: '2026-03-15T00:00:00.000Z',
                  transfersAllowed: true,
                  transferPolicyText: '### Transferencias',
                  transferDeadline: '2026-03-22T00:00:00.000Z',
                  deferralsAllowed: false,
                  deferralPolicyText: '### Diferimientos',
                  deferralDeadline: null,
                },
              },
            ],
            markdownOutputs: [
              { domain: 'policy', contentMarkdown: '### Reembolsos' },
              { domain: 'policy', contentMarkdown: '### Transferencias' },
              { domain: 'policy', contentMarkdown: '### Diferimientos' },
            ],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPersistenceUpdateEventPolicyConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        refundDeadline: '2026-03-15T00:00:00.000Z',
        transferDeadline: '2026-03-22T00:00:00.000Z',
        deferralDeadline: null,
      }),
    );
  });

  it('interprets naive edition datetimes in the event timezone before persistence regardless of host timezone', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });
    mockGetEventEditionDetail.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      seriesId: 'series-1',
      slug: 'trail-2026',
      timezone: 'America/Mexico_City',
      organizerBrief: null,
      policyConfig: null,
      faqItems: [],
      waivers: [],
      distances: [],
    });

    const originalTz = process.env.TZ;

    try {
      for (const hostTimeZone of ['UTC', 'Europe/Stockholm']) {
        process.env.TZ = hostTimeZone;

        const response = await POST(
          new Request('http://localhost/api/events/ai-wizard/apply', {
            method: 'POST',
            body: JSON.stringify({
              editionId: '11111111-1111-4111-8111-111111111111',
              locale: 'es',
              patch: {
                title: 'Ajustar horario del evento',
                summary: 'Guarda el horario confirmado en la zona del evento.',
                ops: [
                  {
                    type: 'update_edition',
                    editionId: '11111111-1111-4111-8111-111111111111',
                    data: {
                      startsAt: '2026-10-12T07:00:00',
                      endsAt: '2026-10-12T13:00:00',
                    },
                  },
                ],
                markdownOutputs: [],
              },
            }),
          }),
        );

        expect(response.status).toBe(200);
        expect(mockPersistenceUpdateEventEdition).toHaveBeenLastCalledWith(
          expect.anything(),
          expect.objectContaining({
            startsAt: '2026-10-12T13:00:00.000Z',
            endsAt: '2026-10-12T19:00:00.000Z',
          }),
        );
      }
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it('passes structured location fields through to edition persistence, including country', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });
    mockGetEventEditionDetail.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      seriesId: 'series-1',
      slug: 'trail-2026',
      timezone: 'America/Mexico_City',
      organizerBrief: null,
      policyConfig: null,
      faqItems: [],
      waivers: [],
      distances: [],
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Confirmar la ubicación del evento',
            summary: 'Guarda la ubicación confirmada con jerarquía estructurada.',
            ops: [
              {
                type: 'update_edition',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  locationDisplay: 'Bosque de Chapultepec, Ciudad de México, México',
                  address: 'Gran Avenida, 11580 Ciudad de México, México',
                  city: 'Ciudad de México',
                  state: 'Ciudad de México',
                  country: 'MX',
                  latitude: '19.41666781',
                  longitude: '-99.18333064',
                },
              },
            ],
            markdownOutputs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPersistenceUpdateEventEdition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        locationDisplay: 'Bosque de Chapultepec, Ciudad de México, México',
        address: 'Gran Avenida, 11580 Ciudad de México, México',
        city: 'Ciudad de México',
        state: 'Ciudad de México',
        country: 'MX',
        latitude: '19.41666781',
        longitude: '-99.18333064',
      }),
    );
  });

  it('preserves explicit offset semantics for edition datetimes', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });
    mockGetEventEditionDetail.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      seriesId: 'series-1',
      slug: 'trail-2026',
      timezone: 'America/Mexico_City',
      organizerBrief: null,
      policyConfig: null,
      faqItems: [],
      waivers: [],
      distances: [],
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Mantener semántica explícita del horario',
            summary: 'Respeta el offset explícito sin doble conversión.',
            ops: [
              {
                type: 'update_edition',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  startsAt: '2026-10-12T07:00:00-06:00',
                  endsAt: '2026-10-12T13:00:00-06:00',
                },
              },
            ],
            markdownOutputs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPersistenceUpdateEventEdition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        startsAt: '2026-10-12T13:00:00.000Z',
        endsAt: '2026-10-12T19:00:00.000Z',
      }),
    );
  });

  it('replaces the website overview content instead of appending duplicate summary text', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });
    mockPersistenceGetWebsiteContent.mockResolvedValue({
      ok: true,
      data: {
        id: 'content-1',
        editionId: '11111111-1111-4111-8111-111111111111',
        locale: 'es',
        blocks: {
          overview: {
            type: 'overview',
            title: 'Resumen del sitio',
            content: 'Texto anterior del sitio',
            enabled: true,
          },
        },
      },
    });
    mockPersistenceUpdateWebsiteContent.mockResolvedValue({
      ok: true,
      data: { id: 'content-1' },
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Resumen del sitio Distance Smoke 2026',
            summary: 'Versión clara y confiable del resumen del sitio.',
            ops: [
              {
                type: 'append_website_section_markdown',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  section: 'overview',
                  title: 'Resumen del sitio',
                  markdown: 'Texto nuevo del sitio',
                  locale: 'es',
                },
              },
            ],
            markdownOutputs: [{ domain: 'website', contentMarkdown: 'Texto nuevo del sitio' }],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPersistenceUpdateWebsiteContent).toHaveBeenCalledWith(
      expect.anything(),
      {
        locale: 'es',
        blocks: {
          overview: {
            type: 'overview',
            title: 'Resumen del sitio',
            content: 'Texto nuevo del sitio',
            enabled: true,
          },
        },
      },
    );
  });

  it('does not block grounded mixed patches that say they are avoiding invented logistics', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Actualizar contenido confirmado para participantes',
            summary:
              'Aclara el overview y el FAQ con datos confirmados, evitando inventar logística o promesas.',
            ops: [
              {
                type: 'create_faq_item',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  question: '¿Qué incluye la inscripción?',
                  answerMarkdown:
                    'Incluye acceso al evento y seguimiento de tiempos ya confirmados.',
                },
              },
              {
                type: 'append_website_section_markdown',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  section: 'overview',
                  title: 'Resumen',
                  markdown:
                    'Contenido redactado solo con la información ya confirmada por el organizador.',
                  locale: 'es',
                },
              },
            ],
            markdownOutputs: [
              {
                domain: 'faq',
                contentMarkdown:
                  'Incluye acceso al evento y seguimiento de tiempos ya confirmados.',
              },
              {
                domain: 'website',
                contentMarkdown:
                  'Contenido redactado solo con la información ya confirmada por el organizador.',
              },
            ],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPersistenceCreateFaqItem).toHaveBeenCalledTimes(1);
    expect(mockPersistenceUpdateWebsiteContent).toHaveBeenCalledTimes(1);
  });
});
