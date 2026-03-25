const mockGetOrganizerWalletBucketSnapshot = jest.fn();
const mockIngestMoneyMutationFromApi = jest.fn();

jest.mock('@/lib/payments/wallet/snapshot', () => ({
  getOrganizerWalletBucketSnapshot: (...args: unknown[]) =>
    mockGetOrganizerWalletBucketSnapshot(...args),
}));

jest.mock('@/lib/payments/core/mutation-ingress-paths', () => ({
  ingestMoneyMutationFromApi: (...args: unknown[]) => mockIngestMoneyMutationFromApi(...args),
}));

import { and, eq, isNull } from 'drizzle-orm';

import { organizations, payoutContracts, payoutQueuedIntents, payoutQuotes, payoutRequests, users } from '@/db/schema';
import { createQueuedPayoutIntent } from '@/lib/payments/payouts/queue-intents';
import { createPayoutQuoteAndContract } from '@/lib/payments/payouts/quote-contract';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

async function seedOrganizerAndUser(db: ReturnType<typeof getTestDb>) {
  const userId = '11111111-1111-4111-8111-111111111111';
  const organizerId = '22222222-2222-4222-8222-222222222222';

  await db.insert(users).values({
    id: userId,
    name: 'Payout Test User',
    email: 'payout-idempotency@example.com',
    emailVerified: true,
  });

  await db.insert(organizations).values({
    id: organizerId,
    name: 'Payout Test Organizer',
    slug: 'payout-test-organizer',
  });

  return { userId, organizerId };
}

describe('payout persistence idempotency with partial unique indexes (database)', () => {
  const testDb = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
    mockGetOrganizerWalletBucketSnapshot.mockReset();
    mockIngestMoneyMutationFromApi.mockReset();
    mockIngestMoneyMutationFromApi.mockImplementation(async (input: { traceId: string }) => ({
      traceId: input.traceId,
      persistedEvents: [],
      deduplicated: false,
    }));
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
  });

  it('reuses queued payout intent on idempotent retry against a non-deleted row', async () => {
    const { organizerId, userId } = await seedOrganizerAndUser(testDb);
    const now = new Date('2026-03-14T10:00:00.000Z');

    mockGetOrganizerWalletBucketSnapshot.mockResolvedValue({
      organizerId,
      asOf: now,
      buckets: {
        availableMinor: 0,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 0,
      },
      debt: {
        waterfallOrder: [],
        categoryBalancesMinor: {},
        repaymentAppliedMinor: 0,
      },
      historyEventCount: 0,
      queryDurationMs: 1,
    });

    const first = await createQueuedPayoutIntent({
      organizerId,
      createdByUserId: userId,
      requestedAmountMinor: 5_000,
      idempotencyKey: 'queued-partial-index-idem-1',
      now,
    });

    const retry = await createQueuedPayoutIntent({
      organizerId,
      createdByUserId: userId,
      requestedAmountMinor: 5_000,
      idempotencyKey: 'queued-partial-index-idem-1',
      now,
    });

    expect(first.idempotencyReused).toBe(false);
    expect(retry.idempotencyReused).toBe(true);
    expect(retry.payoutQueuedIntentId).toBe(first.payoutQueuedIntentId);

    const rows = await testDb
      .select({
        id: payoutQueuedIntents.id,
      })
      .from(payoutQueuedIntents)
      .where(
        and(
          eq(payoutQueuedIntents.organizerId, organizerId),
          eq(payoutQueuedIntents.idempotencyKey, 'queued-partial-index-idem-1'),
          isNull(payoutQueuedIntents.deletedAt),
        ),
      );

    expect(rows).toHaveLength(1);
  });

  it('reuses payout quote/contract baseline on idempotent retry with the same organizer key', async () => {
    const { organizerId, userId } = await seedOrganizerAndUser(testDb);
    const now = new Date('2026-03-14T11:00:00.000Z');

    mockGetOrganizerWalletBucketSnapshot.mockResolvedValueOnce({
      organizerId,
      asOf: now,
      buckets: {
        availableMinor: 18_000,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 2_000,
      },
      debt: {
        waterfallOrder: [],
        categoryBalancesMinor: {},
        repaymentAppliedMinor: 0,
      },
      historyEventCount: 0,
      queryDurationMs: 1,
    });

    const first = await createPayoutQuoteAndContract({
      organizerId,
      requestedByUserId: userId,
      requestedAmountMinor: 10_000,
      idempotencyKey: 'quote-partial-index-idem-1',
      now,
    });

    const retry = await createPayoutQuoteAndContract({
      organizerId,
      requestedByUserId: userId,
      requestedAmountMinor: 10_000,
      idempotencyKey: 'quote-partial-index-idem-1',
      now,
    });

    expect(first.idempotencyReused).toBe(false);
    expect(retry.idempotencyReused).toBe(true);
    expect(retry.payoutQuoteId).toBe(first.payoutQuoteId);
    expect(retry.payoutRequestId).toBe(first.payoutRequestId);
    expect(retry.payoutContractId).toBe(first.payoutContractId);

    const quoteRows = await testDb
      .select({
        id: payoutQuotes.id,
      })
      .from(payoutQuotes)
      .where(
        and(
          eq(payoutQuotes.organizerId, organizerId),
          eq(payoutQuotes.idempotencyKey, 'quote-partial-index-idem-1'),
          isNull(payoutQuotes.deletedAt),
        ),
      );

    expect(quoteRows).toHaveLength(1);

    const requestRows = await testDb
      .select({
        id: payoutRequests.id,
      })
      .from(payoutRequests)
      .where(
        and(
          eq(payoutRequests.payoutQuoteId, first.payoutQuoteId),
          isNull(payoutRequests.deletedAt),
        ),
      );

    const contractRows = await testDb
      .select({
        id: payoutContracts.id,
      })
      .from(payoutContracts)
      .where(
        and(
          eq(payoutContracts.payoutQuoteId, first.payoutQuoteId),
          isNull(payoutContracts.deletedAt),
        ),
      );

    expect(requestRows).toHaveLength(1);
    expect(contractRows).toHaveLength(1);
  });
});
