import { db } from '@/db';
import { rateLimits } from '@/db/schema';
import { and, eq, lt } from 'drizzle-orm';

interface RateLimitConfig {
  action: string;
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  contact_submission_ip: {
    action: 'contact_submission',
    maxRequests: 5,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  contact_submission_user: {
    action: 'contact_submission',
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  current?: number;
}

export async function checkRateLimit(
  identifier: string,
  identifierType: 'ip' | 'user',
  config?: Partial<RateLimitConfig>
): Promise<RateLimitResult> {
  const configKey = `contact_submission_${identifierType}`;
  const fullConfig = { ...DEFAULT_CONFIGS[configKey], ...config };
  const now = new Date();
  const expiresAt = new Date(now.getTime() + fullConfig.windowMs);

  const [existing] = await db
    .select()
    .from(rateLimits)
    .where(
      and(
        eq(rateLimits.identifier, identifier),
        eq(rateLimits.identifierType, identifierType),
        eq(rateLimits.action, fullConfig.action)
      )
    )
    .limit(1);

  // If an existing window has fully expired, reset it
  if (existing && existing.expiresAt < now) {
    const [updated] = await db
      .update(rateLimits)
      .set({
        count: 1,
        windowStart: now,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(rateLimits.id, existing.id))
      .returning();

    return {
      allowed: true,
      remaining: fullConfig.maxRequests - 1,
      resetAt: updated.expiresAt,
      current: 1,
    };
  }

  // Active window exists – enforce limit
  if (existing) {
    if (existing.count >= fullConfig.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: existing.expiresAt,
        current: existing.count,
      };
    }

    const [updated] = await db
      .update(rateLimits)
      .set({
        count: existing.count + 1,
        updatedAt: now,
      })
      .where(eq(rateLimits.id, existing.id))
      .returning();

    return {
      allowed: true,
      remaining: fullConfig.maxRequests - updated.count,
      resetAt: updated.expiresAt,
      current: updated.count,
    };
  }

  // No existing record – create a new window
  const [created] = await db
    .insert(rateLimits)
    .values({
      identifier,
      identifierType,
      action: fullConfig.action,
      count: 1,
      windowStart: now,
      expiresAt,
      updatedAt: now,
      createdAt: now,
    })
    .returning();

  return {
    allowed: true,
    remaining: fullConfig.maxRequests - 1,
    resetAt: created.expiresAt,
    current: 1,
  };
}

// Cleanup utility (call via cron job)
export async function cleanupExpiredRateLimits(): Promise<number> {
  const now = new Date();
  const result = await db
    .delete(rateLimits)
    .where(lt(rateLimits.expiresAt, now));

  return result.rowCount ?? 0;
}
