'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { eventDistances, eventEditions, registrationGroupMembers, registrationGroups } from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { checkRateLimit } from '@/lib/rate-limit';
import { generateToken, getTokenPrefix, hashToken } from '@/lib/events/group-upload/tokens';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const REGISTRATION_GROUP_DEFAULT_MAX_MEMBERS = parsePositiveIntegerEnv(
  'EVENTS_REGISTRATION_GROUP_DEFAULT_MAX_MEMBERS',
  10,
);
const REGISTRATION_GROUP_MAX_MEMBERS = parsePositiveIntegerEnv('EVENTS_REGISTRATION_GROUP_MAX_MEMBERS', 20);
const REGISTRATION_GROUP_CREATE_MAX_REQUESTS = parsePositiveIntegerEnv(
  'EVENTS_REGISTRATION_GROUP_CREATE_MAX_REQUESTS',
  5,
);
const REGISTRATION_GROUP_CREATE_WINDOW_MS = parsePositiveIntegerEnv(
  'EVENTS_REGISTRATION_GROUP_CREATE_WINDOW_MS',
  10 * 60 * 1000,
);
const REGISTRATION_GROUP_JOIN_MAX_REQUESTS = parsePositiveIntegerEnv(
  'EVENTS_REGISTRATION_GROUP_JOIN_MAX_REQUESTS',
  20,
);
const REGISTRATION_GROUP_JOIN_WINDOW_MS = parsePositiveIntegerEnv(
  'EVENTS_REGISTRATION_GROUP_JOIN_WINDOW_MS',
  10 * 60 * 1000,
);

function clampMaxMembers(value: number): number {
  const min = 2;
  const max = Math.max(REGISTRATION_GROUP_MAX_MEMBERS, min);
  return Math.min(Math.max(value, min), max);
}

function checkEventsAccessForPublicGroup(edition: {
  visibility: string;
  deletedAt: Date | null;
}): { error: string; code: string } | null {
  if (edition.deletedAt) return { error: 'Event edition not found', code: 'NOT_FOUND' };
  if (edition.visibility !== 'published' && edition.visibility !== 'unlisted') {
    return { error: 'Event not available', code: 'NOT_AVAILABLE' };
  }
  return null;
}

const createRegistrationGroupSchema = z.object({
  editionId: z.string().uuid(),
  distanceId: z.string().uuid(),
  name: z.string().max(255).optional().nullable(),
  maxMembers: z.number().int().positive().optional().nullable(),
});

export const createRegistrationGroup = withAuthenticatedUser<
  ActionResult<{ groupToken: string; tokenPrefix: string }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createRegistrationGroupSchema>) => {
  const validated = createRegistrationGroupSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' };
  }

  const { editionId, distanceId, name, maxMembers } = validated.data;

  const rateLimit = await checkRateLimit(authContext.user.id, 'user', {
    action: `registration_group_create_${editionId}`,
    maxRequests: REGISTRATION_GROUP_CREATE_MAX_REQUESTS,
    windowMs: REGISTRATION_GROUP_CREATE_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return { ok: false, error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' };
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    columns: {
      id: true,
      slug: true,
      editionLabel: true,
      visibility: true,
      deletedAt: true,
    },
    with: { series: { columns: { id: true, slug: true, name: true, organizationId: true } } },
  });

  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  const accessError = checkEventsAccessForPublicGroup(edition);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const distance = await db.query.eventDistances.findFirst({
    where: and(
      eq(eventDistances.id, distanceId),
      eq(eventDistances.editionId, editionId),
      isNull(eventDistances.deletedAt),
    ),
    columns: { id: true },
  });

  if (!distance) {
    return { ok: false, error: 'Distance not found for this event', code: 'INVALID_DISTANCE' };
  }

  const resolvedMaxMembers = clampMaxMembers(maxMembers ?? REGISTRATION_GROUP_DEFAULT_MAX_MEMBERS);

  const groupToken = generateToken();
  const tokenHash = hashToken(groupToken);
  const tokenPrefix = getTokenPrefix(groupToken);

  const now = new Date();
  const requestContext = await getRequestContext(await headers());

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(registrationGroups)
        .values({
          editionId,
          distanceId,
          createdByUserId: authContext.user.id,
          name: name ?? null,
          tokenHash,
          tokenPrefix,
          maxMembers: resolvedMaxMembers,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: registrationGroups.id });

      try {
        await createAuditLog(
          {
            organizationId: edition.series.organizationId,
            actorUserId: authContext.user.id,
            action: 'registration_group.create',
            entityType: 'registration_group',
            entityId: created.id,
            after: { editionId, distanceId, name: name ?? null, maxMembers: resolvedMaxMembers },
            request: requestContext,
          },
          tx,
        );
      } catch (error) {
        console.warn('[registration-groups] Failed to write audit log:', error);
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('registration_groups_token_hash_idx')) {
      return { ok: false, error: 'Please try again', code: 'RETRY' };
    }
    throw error;
  }

  return { ok: true, data: { groupToken, tokenPrefix } };
});

const tokenOnlySchema = z.object({
  token: z.string().min(1),
});

async function getGroupByTokenOrThrow(params: { token: string }) {
  const tokenHash = hashToken(params.token);
  const group = await db.query.registrationGroups.findFirst({
    where: and(eq(registrationGroups.tokenHash, tokenHash), isNull(registrationGroups.deletedAt)),
    columns: {
      id: true,
      editionId: true,
      createdByUserId: true,
      maxMembers: true,
      isActive: true,
    },
    with: { edition: { with: { series: true } } },
  });

  if (!group?.edition?.series) {
    throw new Error('NOT_FOUND');
  }

  if (!group.isActive) {
    throw new Error('DISABLED');
  }

  return group;
}

export const joinRegistrationGroup = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof tokenOnlySchema>) => {
  const validated = tokenOnlySchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' };
  }

  const groupToken = validated.data.token;

  const rateLimit = await checkRateLimit(`${authContext.user.id}:${hashToken(groupToken)}`, 'user', {
    action: 'registration_group_join',
    maxRequests: REGISTRATION_GROUP_JOIN_MAX_REQUESTS,
    windowMs: REGISTRATION_GROUP_JOIN_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return { ok: false, error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' };
  }

  let group;
  try {
    group = await getGroupByTokenOrThrow({ token: groupToken });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return { ok: false, error: 'Group not found', code: 'NOT_FOUND' };
    }
    if (error instanceof Error && error.message === 'DISABLED') {
      return { ok: false, error: 'Group link is not active', code: 'DISABLED' };
    }
    throw error;
  }

  const requestContext = await getRequestContext(await headers());

  const now = new Date();

  const result = await db.transaction(async (tx) => {
    // Serialize membership changes per group to prevent races around maxMembers.
    await tx.execute(sql`SELECT id FROM ${registrationGroups} WHERE id = ${group.id} FOR UPDATE`);

    const existingMembership = await tx.query.registrationGroupMembers.findFirst({
      where: and(
        eq(registrationGroupMembers.groupId, group.id),
        eq(registrationGroupMembers.userId, authContext.user.id),
        isNull(registrationGroupMembers.leftAt),
      ),
      columns: { id: true },
    });

    if (existingMembership) {
      return { ok: true as const };
    }

    const otherMembership = await tx
      .select({ groupId: registrationGroupMembers.groupId })
      .from(registrationGroupMembers)
      .innerJoin(registrationGroups, eq(registrationGroupMembers.groupId, registrationGroups.id))
      .where(
        and(
          eq(registrationGroupMembers.userId, authContext.user.id),
          isNull(registrationGroupMembers.leftAt),
          isNull(registrationGroups.deletedAt),
          eq(registrationGroups.editionId, group.editionId),
          sql`${registrationGroups.id} != ${group.id}`,
        ),
      )
      .limit(1);

    if (otherMembership.length > 0) {
      return { ok: false as const, error: 'You already joined another group for this event', code: 'ALREADY_IN_GROUP' };
    }

    const [{ count: memberCount } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(registrationGroupMembers)
      .where(and(eq(registrationGroupMembers.groupId, group.id), isNull(registrationGroupMembers.leftAt)));

    if (Number(memberCount ?? 0) >= group.maxMembers) {
      return { ok: false as const, error: 'This group is full', code: 'GROUP_FULL' };
    }

    await tx.insert(registrationGroupMembers).values({
      groupId: group.id,
      userId: authContext.user.id,
      joinedAt: now,
      leftAt: null,
    });

    try {
      await createAuditLog(
        {
          organizationId: group.edition.series.organizationId,
          actorUserId: authContext.user.id,
          action: 'registration_group.join',
          entityType: 'registration_group',
          entityId: group.id,
          after: { groupId: group.id, editionId: group.editionId },
          request: requestContext,
        },
        tx,
      );
    } catch (error) {
      console.warn('[registration-groups] Failed to write audit log:', error);
    }

    return { ok: true as const };
  });

  if (!result.ok) {
    return { ok: false, error: result.error, code: result.code };
  }

  return { ok: true, data: undefined };
});

export const leaveRegistrationGroup = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof tokenOnlySchema>) => {
  const validated = tokenOnlySchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' };
  }

  let group;
  try {
    group = await getGroupByTokenOrThrow({ token: validated.data.token });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return { ok: false, error: 'Group not found', code: 'NOT_FOUND' };
    }
    if (error instanceof Error && error.message === 'DISABLED') {
      return { ok: false, error: 'Group link is not active', code: 'DISABLED' };
    }
    throw error;
  }

  const now = new Date();
  const requestContext = await getRequestContext(await headers());

  await db.transaction(async (tx) => {
    await tx
      .update(registrationGroupMembers)
      .set({ leftAt: now })
      .where(
        and(
          eq(registrationGroupMembers.groupId, group.id),
          eq(registrationGroupMembers.userId, authContext.user.id),
          isNull(registrationGroupMembers.leftAt),
        ),
      );

    try {
      await createAuditLog(
        {
          organizationId: group.edition.series.organizationId,
          actorUserId: authContext.user.id,
          action: 'registration_group.leave',
          entityType: 'registration_group',
          entityId: group.id,
          after: { groupId: group.id, editionId: group.editionId },
          request: requestContext,
        },
        tx,
      );
    } catch (error) {
      console.warn('[registration-groups] Failed to write audit log:', error);
    }
  });

  return { ok: true, data: undefined };
});

const removeMemberSchema = z.object({
  token: z.string().min(1),
  userId: z.string().uuid(),
});

export const removeRegistrationGroupMember = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof removeMemberSchema>) => {
  const validated = removeMemberSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' };
  }

  const memberUserId = validated.data.userId;
  if (memberUserId === authContext.user.id) {
    return { ok: false, error: 'You cannot remove yourself', code: 'INVALID_MEMBER' };
  }

  let group;
  try {
    group = await getGroupByTokenOrThrow({ token: validated.data.token });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return { ok: false, error: 'Group not found', code: 'NOT_FOUND' };
    }
    if (error instanceof Error && error.message === 'DISABLED') {
      return { ok: false, error: 'Group link is not active', code: 'DISABLED' };
    }
    throw error;
  }

  if (group.createdByUserId !== authContext.user.id) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  const now = new Date();
  const requestContext = await getRequestContext(await headers());

  await db.transaction(async (tx) => {
    await tx
      .update(registrationGroupMembers)
      .set({ leftAt: now })
      .where(
        and(
          eq(registrationGroupMembers.groupId, group.id),
          eq(registrationGroupMembers.userId, memberUserId),
          isNull(registrationGroupMembers.leftAt),
        ),
      );

    try {
      await createAuditLog(
        {
          organizationId: group.edition.series.organizationId,
          actorUserId: authContext.user.id,
          action: 'registration_group.member.remove',
          entityType: 'registration_group',
          entityId: group.id,
          after: { groupId: group.id, memberUserId },
          request: requestContext,
        },
        tx,
      );
    } catch (error) {
      console.warn('[registration-groups] Failed to write audit log:', error);
    }
  });

  return { ok: true, data: undefined };
});
