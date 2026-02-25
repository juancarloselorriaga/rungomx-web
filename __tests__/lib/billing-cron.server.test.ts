const mockFindManyBillingSubscriptions = jest.fn();
const mockInsert = jest.fn();
const mockInsertValues = jest.fn();
const mockInsertOnConflictDoNothing = jest.fn();
const mockInsertReturning = jest.fn();

const mockTransaction = jest.fn();
const mockExecute = jest.fn();
const mockFindFirstBillingSubscription = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateSet = jest.fn();
const mockUpdateWhere = jest.fn();
const mockUpdateReturning = jest.fn();
const mockTxInsert = jest.fn();
const mockTxInsertValues = jest.fn();
const mockTxInsertOnConflictDoNothing = jest.fn();

const mockSafeRevalidateTag = jest.fn();
const mockSendGracePeriodReminderEmail = jest.fn();
const mockSendSubscriptionEndedEmail = jest.fn();

const dbInsertReturningQueue: Array<unknown[]> = [];
const txUpdateReturningQueue: Array<unknown[]> = [];

jest.mock('@/db', () => ({
  db: {
    query: {
      billingSubscriptions: {
        findMany: (...args: unknown[]) => mockFindManyBillingSubscriptions(...args),
      },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

jest.mock('@/lib/next-cache', () => ({
  safeRevalidateTag: (...args: unknown[]) => mockSafeRevalidateTag(...args),
}));

jest.mock('@/lib/billing/emails', () => ({
  sendGracePeriodReminderEmail: (...args: unknown[]) =>
    mockSendGracePeriodReminderEmail(...args),
  sendSubscriptionEndedEmail: (...args: unknown[]) =>
    mockSendSubscriptionEndedEmail(...args),
  sendTrialExpiringSoonEmail: jest.fn(),
}));

import { billingStatusTag } from '@/lib/billing/cache-tags';
import { runGraceReminderCadenceAndExpiryDowngrade } from '@/lib/billing/cron';

describe('billing grace reminder cadence and expiry downgrade', () => {
  beforeEach(() => {
    dbInsertReturningQueue.length = 0;
    txUpdateReturningQueue.length = 0;

    mockFindManyBillingSubscriptions.mockReset();
    mockInsert.mockReset();
    mockInsertValues.mockReset();
    mockInsertOnConflictDoNothing.mockReset();
    mockInsertReturning.mockReset();

    mockTransaction.mockReset();
    mockExecute.mockReset();
    mockFindFirstBillingSubscription.mockReset();
    mockUpdate.mockReset();
    mockUpdateSet.mockReset();
    mockUpdateWhere.mockReset();
    mockUpdateReturning.mockReset();
    mockTxInsert.mockReset();
    mockTxInsertValues.mockReset();
    mockTxInsertOnConflictDoNothing.mockReset();

    mockSafeRevalidateTag.mockReset();
    mockSendGracePeriodReminderEmail.mockReset();
    mockSendSubscriptionEndedEmail.mockReset();
    mockSendGracePeriodReminderEmail.mockResolvedValue(undefined);
    mockSendSubscriptionEndedEmail.mockResolvedValue(undefined);

    mockInsert.mockImplementation(() => ({
      values: (...valuesArgs: unknown[]) => {
        mockInsertValues(...valuesArgs);
        return {
          onConflictDoNothing: (...conflictArgs: unknown[]) => {
            mockInsertOnConflictDoNothing(...conflictArgs);
            return {
              returning: (...returningArgs: unknown[]) => {
                mockInsertReturning(...returningArgs);
                return Promise.resolve(dbInsertReturningQueue.shift() ?? []);
              },
            };
          },
        };
      },
    }));

    mockUpdate.mockImplementation(() => ({
      set: (...setArgs: unknown[]) => {
        mockUpdateSet(...setArgs);
        return {
          where: (...whereArgs: unknown[]) => {
            mockUpdateWhere(...whereArgs);
            return {
              returning: (...returningArgs: unknown[]) => {
                mockUpdateReturning(...returningArgs);
                return Promise.resolve(txUpdateReturningQueue.shift() ?? []);
              },
            };
          },
        };
      },
    }));

    mockTxInsert.mockImplementation(() => ({
      values: (...valuesArgs: unknown[]) => {
        mockTxInsertValues(...valuesArgs);
        return {
          onConflictDoNothing: (...conflictArgs: unknown[]) => {
            mockTxInsertOnConflictDoNothing(...conflictArgs);
            return Promise.resolve(undefined);
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
        insert: (...args: unknown[]) => mockTxInsert(...args),
      };

      return callback(tx);
    });
  });

  it('sends grace reminders only once per cadence checkpoint under repeated scheduler runs', async () => {
    const now = new Date('2026-03-01T10:00:00.000Z');
    const graceEndsAt = new Date('2026-03-04T10:00:00.000Z');
    const userId = '11111111-1111-4111-8111-111111111111';
    const subscriptionId = '22222222-2222-4222-8222-222222222222';

    mockFindManyBillingSubscriptions.mockResolvedValue([
      {
        id: subscriptionId,
        userId,
        currentPeriodEndsAt: graceEndsAt,
      },
    ]);

    dbInsertReturningQueue.push([{ id: 'evt-1' }], []);

    const first = await runGraceReminderCadenceAndExpiryDowngrade({
      now,
      reminderCadenceDays: [5, 2, 1],
    });
    const second = await runGraceReminderCadenceAndExpiryDowngrade({
      now,
      reminderCadenceDays: [5, 2, 1],
    });

    expect(first).toEqual({ remindersSent: 1, downgradedSubscriptions: 0 });
    expect(second).toEqual({ remindersSent: 0, downgradedSubscriptions: 0 });
    expect(mockSendGracePeriodReminderEmail).toHaveBeenCalledTimes(1);
    expect(mockSendGracePeriodReminderEmail).toHaveBeenCalledWith({
      userId,
      graceEndsAt,
      daysRemaining: 3,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('downgrades expired grace subscriptions idempotently and revalidates billing cache', async () => {
    const now = new Date('2026-03-05T10:00:00.000Z');
    const graceEndsAt = new Date('2026-03-04T10:00:00.000Z');
    const userId = '33333333-3333-4333-8333-333333333333';
    const subscriptionId = '44444444-4444-4444-8444-444444444444';

    mockFindManyBillingSubscriptions.mockResolvedValue([
      {
        id: subscriptionId,
        userId,
        currentPeriodEndsAt: graceEndsAt,
      },
    ]);

    mockFindFirstBillingSubscription.mockResolvedValue({
      id: subscriptionId,
      userId,
      status: 'grace',
      currentPeriodEndsAt: graceEndsAt,
    });

    txUpdateReturningQueue.push(
      [{ id: subscriptionId, userId, endedAt: graceEndsAt }],
      [],
    );

    const first = await runGraceReminderCadenceAndExpiryDowngrade({ now });
    const second = await runGraceReminderCadenceAndExpiryDowngrade({ now });

    expect(first).toEqual({ remindersSent: 0, downgradedSubscriptions: 1 });
    expect(second).toEqual({ remindersSent: 0, downgradedSubscriptions: 0 });
    expect(mockSendSubscriptionEndedEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSubscriptionEndedEmail).toHaveBeenCalledWith({
      userId,
      endedStatus: 'grace',
    });
    expect(mockSafeRevalidateTag).toHaveBeenCalledWith(billingStatusTag(userId), {
      expire: 0,
    });
  });
});
