import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  groupDiscountRules,
  registrationGroupMembers,
  registrationGroups,
  registrations,
  users,
} from '@/db/schema';
import { hashToken } from '@/lib/events/group-upload/tokens';

export type RegistrationGroupStatus = 'ACTIVE' | 'DISABLED' | 'NOT_FOUND';

type RegistrationGroupSummary = {
  id: string;
  editionId: string;
  distanceId: string;
  createdByUserId: string;
  name: string | null;
  tokenPrefix: string;
  maxMembers: number;
  isActive: boolean;
};

type RegistrationRow = {
  id: string;
  buyerUserId: string | null;
  status: string;
  distanceId: string;
  expiresAt: Date | null;
  createdAt: Date;
};

function resolveGroupStatus(group: RegistrationGroupSummary): RegistrationGroupStatus {
  if (!group.isActive) return 'DISABLED';
  return 'ACTIVE';
}

function resolveRegistrationForMember(
  registrationRows: RegistrationRow[],
  now: Date,
): RegistrationRow | null {
  const byPriority = (row: RegistrationRow): number => {
    if (row.status === 'confirmed') return 4;
    if (row.status === 'payment_pending' && row.expiresAt && row.expiresAt > now) return 3;
    if ((row.status === 'started' || row.status === 'submitted') && row.expiresAt && row.expiresAt > now) {
      return 2;
    }
    return 0;
  };

  const sorted = [...registrationRows].sort((a, b) => {
    const priorityDiff = byPriority(b) - byPriority(a);
    if (priorityDiff !== 0) return priorityDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const best = sorted[0];
  return best && byPriority(best) > 0 ? best : null;
}

function formatMemberDisplayName(name: string): string {
  const parts = name.split(' ').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return name;
  if (parts.length === 1) return parts[0];
  const lastInitial = parts[parts.length - 1]?.[0] ?? '';
  return lastInitial ? `${parts[0]} ${lastInitial}.` : parts[0];
}

export async function getRegistrationGroupContext(params: {
  token: string;
  userId?: string | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const tokenHash = hashToken(params.token);

  const group = await db.query.registrationGroups.findFirst({
    where: and(eq(registrationGroups.tokenHash, tokenHash), isNull(registrationGroups.deletedAt)),
    columns: {
      id: true,
      editionId: true,
      distanceId: true,
      createdByUserId: true,
      name: true,
      tokenPrefix: true,
      maxMembers: true,
      isActive: true,
    },
  });

  if (!group) {
    return {
      status: 'NOT_FOUND' as const,
      group: null,
      event: null,
      distance: null,
      memberCount: 0,
      memberSummary: [],
      discount: {
        tiers: [],
        joinedMemberCount: 0,
        currentPercentOff: null,
        nextTier: null,
      },
      viewer: {
        isAuthenticated: Boolean(params.userId),
        isCreator: false,
        isMember: false,
        hasJoinedOtherGroupInEdition: false,
      },
      members: [],
    };
  }

  const status = resolveGroupStatus(group);

  const [edition, distance, memberCountRow, verifiedMemberCountRow] = await Promise.all([
    db.query.eventEditions.findFirst({
      where: and(eq(eventEditions.id, group.editionId), isNull(eventEditions.deletedAt)),
      with: { series: true },
    }),
    db.query.eventDistances.findFirst({
      where: and(eq(eventDistances.id, group.distanceId), isNull(eventDistances.deletedAt)),
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(registrationGroupMembers)
      .where(and(eq(registrationGroupMembers.groupId, group.id), isNull(registrationGroupMembers.leftAt))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(registrationGroupMembers)
      .innerJoin(users, eq(registrationGroupMembers.userId, users.id))
      .where(
        and(
          eq(registrationGroupMembers.groupId, group.id),
          isNull(registrationGroupMembers.leftAt),
          isNull(users.deletedAt),
          eq(users.emailVerified, true),
        ),
      ),
  ]);

  if (!edition?.series || !distance) {
    return {
      status: 'NOT_FOUND' as const,
      group: null,
      event: null,
      distance: null,
      memberCount: 0,
      memberSummary: [],
      discount: {
        tiers: [],
        joinedMemberCount: 0,
        currentPercentOff: null,
        nextTier: null,
      },
      viewer: {
        isAuthenticated: Boolean(params.userId),
        isCreator: false,
        isMember: false,
        hasJoinedOtherGroupInEdition: false,
      },
      members: [],
    };
  }

  const memberCount = memberCountRow[0]?.count ?? 0;
  const verifiedMemberCount = verifiedMemberCountRow[0]?.count ?? 0;

  const discountRules = await db.query.groupDiscountRules.findMany({
    where: and(
      eq(groupDiscountRules.editionId, group.editionId),
      eq(groupDiscountRules.isActive, true),
    ),
    orderBy: (rule, { asc }) => [asc(rule.minParticipants)],
  });

  const discountTiers = discountRules
    .filter((rule) => rule.minParticipants <= group.maxMembers)
    .map((rule) => ({
      minParticipants: rule.minParticipants,
      percentOff: rule.percentOff,
    }));

  let currentPercentOff: number | null = null;
  for (const tier of discountTiers) {
    if (verifiedMemberCount >= tier.minParticipants) {
      currentPercentOff = tier.percentOff;
    }
  }

  const nextTierCandidate =
    discountTiers.find((tier) => verifiedMemberCount < tier.minParticipants) ?? null;
  const nextTier = nextTierCandidate
    ? {
        minParticipants: nextTierCandidate.minParticipants,
        percentOff: nextTierCandidate.percentOff,
        membersNeeded: Math.max(nextTierCandidate.minParticipants - verifiedMemberCount, 0),
      }
    : null;

  // Determine registration status for the event
  let isRegistrationOpen = false;
  if (!edition.isRegistrationPaused) {
    const hasOpened = !edition.registrationOpensAt || now >= edition.registrationOpensAt;
    const hasNotClosed = !edition.registrationClosesAt || now <= edition.registrationClosesAt;
    isRegistrationOpen = hasOpened && hasNotClosed;
  }

  // Compute spots remaining for this group's selected distance (non-authoritative; no holds are created here).
  const isSharedPool = distance.capacityScope === 'shared_pool' && edition.sharedCapacity !== null;
  const [{ count: reservedCountRaw } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(registrations)
    .where(
      and(
        isSharedPool ? eq(registrations.editionId, edition.id) : eq(registrations.distanceId, distance.id),
        or(
          eq(registrations.status, 'confirmed'),
          and(
            or(
              eq(registrations.status, 'started'),
              eq(registrations.status, 'submitted'),
              eq(registrations.status, 'payment_pending'),
            ),
            gt(registrations.expiresAt, now),
          ),
        ),
        isNull(registrations.deletedAt),
      ),
    );

  const reservedCount = Number(reservedCountRaw ?? 0);
  const spotsRemaining = isSharedPool
    ? Math.max((edition.sharedCapacity ?? 0) - reservedCount, 0)
    : distance.capacity !== null
      ? Math.max(distance.capacity - reservedCount, 0)
      : null;

  const viewerUserId = params.userId ?? null;
  const isCreator = Boolean(viewerUserId && viewerUserId === group.createdByUserId);

  const [viewerMembership, otherMembership] = viewerUserId
    ? await Promise.all([
        db.query.registrationGroupMembers.findFirst({
          where: and(
            eq(registrationGroupMembers.groupId, group.id),
            eq(registrationGroupMembers.userId, viewerUserId),
            isNull(registrationGroupMembers.leftAt),
          ),
          columns: { id: true },
        }),
        db
          .select({ groupId: registrationGroupMembers.groupId })
          .from(registrationGroupMembers)
          .innerJoin(registrationGroups, eq(registrationGroupMembers.groupId, registrationGroups.id))
          .where(
            and(
              eq(registrationGroupMembers.userId, viewerUserId),
              isNull(registrationGroupMembers.leftAt),
              isNull(registrationGroups.deletedAt),
              eq(registrationGroups.editionId, group.editionId),
              sql`${registrationGroups.id} != ${group.id}`,
            ),
          )
          .limit(1),
      ])
    : [null, []];

  const isMember = Boolean(viewerMembership);
  const hasJoinedOtherGroupInEdition = otherMembership.length > 0;

  let members: Array<{
    userId: string;
    name: string;
    joinedAt: string;
    registration: { id: string; status: string; expiresAt: string | null; distanceId: string } | null;
  }> = [];
  let memberSummary: Array<{
    userId: string;
    displayName: string;
    isRegistered: boolean;
  }> = [];

  if (isCreator || isMember) {
    const memberRows = await db
      .select({
        userId: users.id,
        name: users.name,
        joinedAt: registrationGroupMembers.joinedAt,
      })
      .from(registrationGroupMembers)
      .innerJoin(users, eq(registrationGroupMembers.userId, users.id))
      .where(
        and(
          eq(registrationGroupMembers.groupId, group.id),
          isNull(registrationGroupMembers.leftAt),
          isNull(users.deletedAt),
        ),
      )
      .orderBy(asc(registrationGroupMembers.joinedAt));

    const memberUserIds = memberRows.map((row) => row.userId);

    const registrationRows =
      memberUserIds.length > 0
        ? await db
            .select({
              id: registrations.id,
              buyerUserId: registrations.buyerUserId,
              status: registrations.status,
              distanceId: registrations.distanceId,
              expiresAt: registrations.expiresAt,
              createdAt: registrations.createdAt,
            })
            .from(registrations)
            .where(
              and(
                inArray(registrations.buyerUserId, memberUserIds),
                eq(registrations.editionId, group.editionId),
                isNull(registrations.deletedAt),
              ),
            )
        : [];

    const registrationsByUser = new Map<string, RegistrationRow[]>();
    for (const row of registrationRows) {
      if (!row.buyerUserId) continue;
      const list = registrationsByUser.get(row.buyerUserId) ?? [];
      list.push(row);
      registrationsByUser.set(row.buyerUserId, list);
    }

    const resolvedMembers = memberRows.map((member) => {
      const reg = resolveRegistrationForMember(registrationsByUser.get(member.userId) ?? [], now);
      return { member, registration: reg };
    });

    memberSummary = resolvedMembers.map(({ member, registration }) => ({
      userId: member.userId,
      displayName: isCreator ? member.name : formatMemberDisplayName(member.name),
      isRegistered: Boolean(registration),
    }));

    if (isCreator) {
      members = resolvedMembers.map(({ member, registration }) => ({
        userId: member.userId,
        name: member.name,
        joinedAt: member.joinedAt.toISOString(),
        registration: registration
          ? {
              id: registration.id,
              status: registration.status,
              expiresAt: registration.expiresAt ? registration.expiresAt.toISOString() : null,
              distanceId: registration.distanceId,
            }
          : null,
      }));
    }
  }

  return {
    status,
    group: {
      id: group.id,
      name: group.name ?? null,
      tokenPrefix: group.tokenPrefix,
      maxMembers: group.maxMembers,
      createdByUserId: group.createdByUserId,
    },
    event: {
      editionId: edition.id,
      editionSlug: edition.slug,
      editionLabel: edition.editionLabel,
      seriesSlug: edition.series.slug,
      seriesName: edition.series.name,
      startsAt: edition.startsAt,
      endsAt: edition.endsAt,
      timezone: edition.timezone,
      locationDisplay: edition.locationDisplay,
      city: edition.city,
      state: edition.state,
      isRegistrationPaused: edition.isRegistrationPaused,
      registrationOpensAt: edition.registrationOpensAt,
      registrationClosesAt: edition.registrationClosesAt,
      isRegistrationOpen,
    },
    distance: {
      id: distance.id,
      label: distance.label,
      spotsRemaining,
    },
    memberCount,
    memberSummary,
    discount: {
      tiers: discountTiers,
      joinedMemberCount: verifiedMemberCount,
      currentPercentOff,
      nextTier,
    },
    viewer: {
      isAuthenticated: Boolean(viewerUserId),
      isCreator,
      isMember,
      hasJoinedOtherGroupInEdition,
    },
    members,
  };
}
