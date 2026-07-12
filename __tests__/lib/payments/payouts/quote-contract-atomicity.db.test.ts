const mockGetOrganizerWalletBucketSnapshot = jest.fn();
const mockIngestMoneyMutationFromApi = jest.fn();
const mockIngestMoneyMutationFromApiInTransaction = jest.fn();

jest.mock('@/lib/payments/wallet/snapshot', () => ({
  getOrganizerWalletBucketSnapshot: (...args: unknown[]) =>
    mockGetOrganizerWalletBucketSnapshot(...args),
}));

// CRITICAL: mock BOTH the non-tx and in-tx ingress entrypoints. Pre-fix, the
// production code only calls the non-tx path; post-fix it calls the in-tx
// path from inside db.transaction. Mocking only one would let this test pass
// vacuously regardless of which code path actually runs.
jest.mock('@/lib/payments/core/mutation-ingress-paths', () => ({
  ingestMoneyMutationFromApi: (...args: unknown[]) => mockIngestMoneyMutationFromApi(...args),
  ingestMoneyMutationFromApiInTransaction: (...args: unknown[]) =>
    mockIngestMoneyMutationFromApiInTransaction(...args),
}));

import { and, eq, isNull } from 'drizzle-orm';

import { organizations, payoutContracts, payoutQuotes, payoutRequests, users } from '@/db/schema';
import { createPayoutQuoteAndContract } from '@/lib/payments/payouts/quote-contract';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

async function seedOrganizerAndUser(db: ReturnType<typeof getTestDb>) {
  const userId = '55555555-5555-4555-8555-555555555555';
  const organizerId = '66666666-6666-4666-8666-666666666666';

  await db.insert(users).values({
    id: userId,
    name: 'Payout Atomicity Test User',
    email: 'payout-atomicity@example.com',
    emailVerified: true,
  });

  await db.insert(organizations).values({
    id: organizerId,
    name: 'Payout Atomicity Test Organizer',
    slug: 'payout-atomicity-test-organizer',
  });

  return { userId, organizerId };
}

describe('payout quote/request/contract creation atomicity (database)', () => {
  const testDb = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
    mockGetOrganizerWalletBucketSnapshot.mockReset();
    mockIngestMoneyMutationFromApi.mockReset();
    mockIngestMoneyMutationFromApiInTransaction.mockReset();
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
  });

  // The mutation-ingress-paths module is fully mocked above (both the non-tx
  // and in-tx entrypoints), so this test never writes real money_events /
  // money_traces / money_command_ingestions rows. No money-table cleanup is
  // needed beyond the standard cleanDatabase() organizer wipe.
  it('rolls back quote/request/contract when the payout.requested ingress fails, then unblocks a fresh-key retry', async () => {
    const { organizerId, userId } = await seedOrganizerAndUser(testDb);
    const now = new Date('2026-03-14T12:00:00.000Z');

    mockGetOrganizerWalletBucketSnapshot.mockResolvedValue({
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

    const ingressFailure = new Error('synthetic ingress failure after request insert');
    mockIngestMoneyMutationFromApi.mockRejectedValue(ingressFailure);
    mockIngestMoneyMutationFromApiInTransaction.mockRejectedValue(ingressFailure);

    await expect(
      createPayoutQuoteAndContract({
        organizerId,
        requestedByUserId: userId,
        requestedAmountMinor: 10_000,
        idempotencyKey: 'atomicity-attempt-1',
        now,
      }),
    ).rejects.toThrow('synthetic ingress failure after request insert');

    const quoteRowsAfterFailure = await testDb
      .select({ id: payoutQuotes.id })
      .from(payoutQuotes)
      .where(and(eq(payoutQuotes.organizerId, organizerId), isNull(payoutQuotes.deletedAt)));

    const requestRowsAfterFailure = await testDb
      .select({ id: payoutRequests.id })
      .from(payoutRequests)
      .where(and(eq(payoutRequests.organizerId, organizerId), isNull(payoutRequests.deletedAt)));

    const contractRowsAfterFailure = await testDb
      .select({ id: payoutContracts.id })
      .from(payoutContracts)
      .where(and(eq(payoutContracts.organizerId, organizerId), isNull(payoutContracts.deletedAt)));

    expect(quoteRowsAfterFailure).toHaveLength(0);
    expect(requestRowsAfterFailure).toHaveLength(0);
    expect(contractRowsAfterFailure).toHaveLength(0);

    mockIngestMoneyMutationFromApi.mockResolvedValue({
      traceId: 'payout-request:atomicity-retry',
      persistedEvents: [],
      deduplicated: false,
    });
    mockIngestMoneyMutationFromApiInTransaction.mockResolvedValue({
      traceId: 'payout-request:atomicity-retry',
      persistedEvents: [],
      deduplicated: false,
    });

    const retry = await createPayoutQuoteAndContract({
      organizerId,
      requestedByUserId: userId,
      requestedAmountMinor: 10_000,
      idempotencyKey: 'atomicity-attempt-2-fresh-key',
      now,
    });

    expect(retry.idempotencyReused).toBe(false);

    const requestRowsAfterRetry = await testDb
      .select({ id: payoutRequests.id, status: payoutRequests.status })
      .from(payoutRequests)
      .where(and(eq(payoutRequests.organizerId, organizerId), isNull(payoutRequests.deletedAt)));

    expect(requestRowsAfterRetry).toHaveLength(1);
    expect(requestRowsAfterRetry[0]?.status).toBe('requested');
  });
});
