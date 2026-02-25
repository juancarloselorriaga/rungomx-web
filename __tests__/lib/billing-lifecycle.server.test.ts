const mockTransaction = jest.fn();
const mockExecute = jest.fn();
const mockFindFirstBillingSubscription = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateSet = jest.fn();
const mockUpdateWhere = jest.fn();
const mockUpdateReturning = jest.fn();
const mockSafeRevalidateTag = jest.fn();

const updateReturningQueue: Array<unknown[]> = [];

jest.mock('@/db', () => ({
  db: {
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

jest.mock('@/lib/next-cache', () => ({
  safeRevalidateTag: (...args: unknown[]) => mockSafeRevalidateTag(...args),
}));

import { billingStatusTag } from '@/lib/billing/cache-tags';
import {
  BILLING_GRACE_PERIOD_DAYS,
  deriveRenewalFailureGraceWindow,
  transitionSubscriptionToGraceFromRenewalFailedEvent,
  transitionSubscriptionToGraceOnRenewalFailure,
} from '@/lib/billing/lifecycle';

describe('billing lifecycle renewal failure transition', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const subscriptionId = '22222222-2222-4222-8222-222222222222';
  const now = new Date('2026-02-25T20:00:00.000Z');
  const defaultGraceEndsAt = new Date('2026-03-04T20:00:00.000Z');

  beforeEach(() => {
    updateReturningQueue.length = 0;

    mockTransaction.mockReset();
    mockExecute.mockReset();
    mockFindFirstBillingSubscription.mockReset();
    mockUpdate.mockReset();
    mockUpdateSet.mockReset();
    mockUpdateWhere.mockReset();
    mockUpdateReturning.mockReset();
    mockSafeRevalidateTag.mockReset();

    mockUpdate.mockImplementation(() => ({
      set: (...setArgs: unknown[]) => {
        mockUpdateSet(...setArgs);
        return {
          where: (...whereArgs: unknown[]) => {
            mockUpdateWhere(...whereArgs);
            return {
              returning: (...returningArgs: unknown[]) => {
                mockUpdateReturning(...returningArgs);
                return Promise.resolve(updateReturningQueue.shift() ?? []);
              },
            };
          },
        };
      },
    }));

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: (...args: unknown[]) => mockExecute(...args),
        query: {
          billingSubscriptions: {
            findFirst: (...args: unknown[]) => mockFindFirstBillingSubscription(...args),
          },
        },
        update: (...args: unknown[]) => mockUpdate(...args),
      };

      return callback(tx);
    });
  });

  it('derives deterministic 7-day grace window by default', () => {
    const occurredAt = new Date('2026-02-25T20:00:00.000Z');

    const result = deriveRenewalFailureGraceWindow({ occurredAt });

    expect(result.graceStartedAt.toISOString()).toBe('2026-02-25T20:00:00.000Z');
    expect(result.graceEndsAt.toISOString()).toBe('2026-03-04T20:00:00.000Z');
    expect(result.graceEndsAt.getTime() - result.graceStartedAt.getTime()).toBe(
      BILLING_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );
  });

  it('transitions active subscription to grace and persists deterministic window metadata', async () => {
    mockFindFirstBillingSubscription.mockResolvedValueOnce({
      id: subscriptionId,
      userId,
      status: 'active',
      currentPeriodStartsAt: new Date('2026-02-01T00:00:00.000Z'),
      currentPeriodEndsAt: new Date('2026-02-25T19:59:59.000Z'),
    });
    updateReturningQueue.push([
      {
        id: subscriptionId,
        userId,
        status: 'grace',
        currentPeriodStartsAt: now,
        currentPeriodEndsAt: defaultGraceEndsAt,
      },
    ]);

    const result = await transitionSubscriptionToGraceOnRenewalFailure({
      userId,
      subscriptionId,
      renewalAttempt: 1,
      graceEndsAt: defaultGraceEndsAt,
      now,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        subscriptionId,
        userId,
        previousStatus: 'active',
        status: 'grace',
        renewalAttempt: 1,
        applied: true,
      },
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith({
      status: 'grace',
      currentPeriodStartsAt: now,
      currentPeriodEndsAt: defaultGraceEndsAt,
      endedAt: null,
      updatedAt: now,
    });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith(billingStatusTag(userId), { expire: 0 });
  });

  it('returns idempotent no-op for duplicate grace transition signal in same billing period', async () => {
    mockFindFirstBillingSubscription.mockResolvedValueOnce({
      id: subscriptionId,
      userId,
      status: 'grace',
      currentPeriodStartsAt: new Date('2026-02-25T20:00:00.000Z'),
      currentPeriodEndsAt: new Date('2026-03-04T20:00:00.000Z'),
    });

    const result = await transitionSubscriptionToGraceOnRenewalFailure({
      userId,
      subscriptionId,
      renewalAttempt: 1,
      graceEndsAt: new Date('2026-03-04T19:00:00.000Z'),
      now,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        subscriptionId,
        status: 'grace',
        applied: false,
      },
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSafeRevalidateTag).not.toHaveBeenCalled();
  });

  it('extends existing grace end deterministically and preserves grace start timestamp', async () => {
    const existingGraceStart = new Date('2026-02-25T20:00:00.000Z');
    const existingGraceEnd = new Date('2026-03-04T20:00:00.000Z');
    const extendedGraceEnd = new Date('2026-03-06T20:00:00.000Z');

    mockFindFirstBillingSubscription.mockResolvedValueOnce({
      id: subscriptionId,
      userId,
      status: 'grace',
      currentPeriodStartsAt: existingGraceStart,
      currentPeriodEndsAt: existingGraceEnd,
    });
    updateReturningQueue.push([
      {
        id: subscriptionId,
        userId,
        status: 'grace',
        currentPeriodStartsAt: existingGraceStart,
        currentPeriodEndsAt: extendedGraceEnd,
      },
    ]);

    const result = await transitionSubscriptionToGraceOnRenewalFailure({
      userId,
      subscriptionId,
      renewalAttempt: 2,
      graceEndsAt: extendedGraceEnd,
      now,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        subscriptionId,
        previousStatus: 'grace',
        status: 'grace',
        applied: true,
      },
    });
    expect(result.ok && result.data.graceStartedAt.toISOString()).toBe(
      '2026-02-25T20:00:00.000Z',
    );
    expect(result.ok && result.data.graceEndsAt.toISOString()).toBe(
      '2026-03-06T20:00:00.000Z',
    );
    expect(mockUpdateSet).toHaveBeenCalledWith({
      status: 'grace',
      currentPeriodStartsAt: existingGraceStart,
      currentPeriodEndsAt: extendedGraceEnd,
      endedAt: null,
      updatedAt: now,
    });
  });

  it('accepts canonical renewal-failed events and defaults transition timestamp to occurredAt', async () => {
    const occurredAt = new Date('2026-02-25T11:00:00.000Z');
    const graceEndsAt = new Date('2026-03-04T11:00:00.000Z');

    mockFindFirstBillingSubscription.mockResolvedValueOnce({
      id: subscriptionId,
      userId,
      status: 'active',
      currentPeriodStartsAt: new Date('2026-02-01T00:00:00.000Z'),
      currentPeriodEndsAt: new Date('2026-02-25T10:59:59.000Z'),
    });
    updateReturningQueue.push([
      {
        id: subscriptionId,
        userId,
        status: 'grace',
        currentPeriodStartsAt: occurredAt,
        currentPeriodEndsAt: graceEndsAt,
      },
    ]);

    const result = await transitionSubscriptionToGraceFromRenewalFailedEvent({
      event: {
        eventId: '33333333-3333-4333-8333-333333333333',
        traceId: 'trace-subscription-renewal-failed',
        occurredAt: occurredAt.toISOString(),
        recordedAt: occurredAt.toISOString(),
        eventName: 'subscription.renewal_failed',
        version: 1,
        entityType: 'subscription',
        entityId: subscriptionId,
        source: 'worker',
        metadata: {},
        payload: {
          organizerId: userId,
          subscriptionId,
          renewalAttempt: 1,
          graceEndsAt: graceEndsAt.toISOString(),
          reasonCode: 'card_declined',
        },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        status: 'grace',
        graceStartedAt: occurredAt,
        graceEndsAt,
      },
    });
  });

  it('fails fast when renewal attempt is invalid', async () => {
    const result = await transitionSubscriptionToGraceOnRenewalFailure({
      userId,
      subscriptionId,
      renewalAttempt: 0,
      graceEndsAt: defaultGraceEndsAt,
      now,
    });

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_RENEWAL_ATTEMPT',
      error: 'Renewal attempt must be an integer greater than zero.',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
