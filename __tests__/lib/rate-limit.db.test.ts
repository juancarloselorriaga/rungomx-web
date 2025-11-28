import { db } from '@/db';
import { rateLimits } from '@/db/schema';
import { checkRateLimit } from '@/lib/rate-limit';
import { and, eq } from 'drizzle-orm';

describe('checkRateLimit (database)', () => {
  const identifier = 'test-identifier';
  const identifierType = 'ip' as const;
  const action = 'contact_submission';

  async function getRecord() {
    const [record] = await db
      .select()
      .from(rateLimits)
      .where(
        and(
          eq(rateLimits.identifier, identifier),
          eq(rateLimits.identifierType, identifierType),
          eq(rateLimits.action, action)
        )
      );

    return record;
  }

  beforeEach(async () => {
    await db
      .delete(rateLimits)
      .where(
        and(
          eq(rateLimits.identifier, identifier),
          eq(rateLimits.identifierType, identifierType),
          eq(rateLimits.action, action)
        )
      );
  });

  it('creates a new window on first call', async () => {
    const result = await checkRateLimit(identifier, identifierType, {
      maxRequests: 3,
      windowMs: 60 * 1000,
    });

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
    expect(result.remaining).toBe(2);
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());

    const record = await getRecord();
    expect(record).toBeDefined();
    expect(record?.count).toBe(1);
  });

  it('increments count and enforces maxRequests within a window', async () => {
    const config = {
      maxRequests: 2,
      windowMs: 60 * 1000,
    };

    const first = await checkRateLimit(identifier, identifierType, config);
    expect(first.allowed).toBe(true);
    expect(first.current).toBe(1);
    expect(first.remaining).toBe(1);

    const second = await checkRateLimit(identifier, identifierType, config);
    expect(second.allowed).toBe(true);
    expect(second.current).toBe(2);
    expect(second.remaining).toBe(0);

    const third = await checkRateLimit(identifier, identifierType, config);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.current).toBeGreaterThanOrEqual(2);

    const record = await getRecord();
    expect(record).toBeDefined();
    expect(record?.count).toBeGreaterThanOrEqual(2);
  });

  it('resets the window when expiry has passed', async () => {
    const config = {
      maxRequests: 2,
      windowMs: 10,
    };

    const initial = await checkRateLimit(identifier, identifierType, config);
    expect(initial.allowed).toBe(true);
    expect(initial.current).toBe(1);

    // Ensure the short window has time to expire
    await new Promise((resolve) => setTimeout(resolve, 20));

    const afterReset = await checkRateLimit(identifier, identifierType, config);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.current).toBe(1);
    expect(afterReset.remaining).toBe(1);

    const updated = await getRecord();
    expect(updated).toBeDefined();
    expect(updated?.count).toBe(1);
  });
});
