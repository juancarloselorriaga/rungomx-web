import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  groupRegistrationBatchRows,
  groupRegistrationBatches,
  groupUploadLinks,
  registrationInvites,
  registrations,
} from '@/db/schema';
import { hashToken } from './tokens';

type DbLike = Pick<typeof db, 'query' | 'select'>;

export type UploadLinkStatus =
  | 'ACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'DISABLED'
  | 'MAXED_OUT'
  | 'NOT_FOUND';

export type UploadLinkSummary = {
  id: string;
  editionId: string;
  tokenPrefix: string;
  name: string | null;
  paymentResponsibility: 'self_pay' | 'central_pay';
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  maxBatches: number | null;
  maxInvites: number | null;
  createdAt: Date;
  revokedAt: Date | null;
  createdByUserId: string;
  revokedByUserId: string | null;
};

function resolveUploadLinkStatus({
  link,
  now,
  batchCount,
  inviteCount,
}: {
  link: UploadLinkSummary;
  now: Date;
  batchCount: number;
  inviteCount: number;
}): UploadLinkStatus {
  if (link.revokedAt) return 'REVOKED';
  if (!link.isActive) return 'DISABLED';
  if (link.startsAt && now < link.startsAt) return 'NOT_STARTED';
  if (link.endsAt && now > link.endsAt) return 'EXPIRED';
  if ((link.maxBatches && batchCount >= link.maxBatches) || (link.maxInvites && inviteCount >= link.maxInvites)) {
    return 'MAXED_OUT';
  }
  return 'ACTIVE';
}

export async function getUploadLinkByToken(params: {
  token: string;
  now?: Date;
  tx?: DbLike;
}) {
  const now = params.now ?? new Date();
  const tokenHash = hashToken(params.token);
  const executor = params.tx ?? db;

  const link = await executor.query.groupUploadLinks.findFirst({
    where: eq(groupUploadLinks.tokenHash, tokenHash),
    columns: {
      id: true,
      editionId: true,
      tokenPrefix: true,
      name: true,
      paymentResponsibility: true,
      startsAt: true,
      endsAt: true,
      isActive: true,
      maxBatches: true,
      maxInvites: true,
      createdAt: true,
      revokedAt: true,
      createdByUserId: true,
      revokedByUserId: true,
    },
  });

  if (!link) {
    return { status: 'NOT_FOUND' as const, link: null, batchCount: 0, inviteCount: 0 };
  }

  const [batchCountResult, inviteCountResult] = await Promise.all([
    executor
      .select({ count: sql<number>`count(*)::int` })
      .from(groupRegistrationBatches)
      .where(eq(groupRegistrationBatches.uploadLinkId, link.id)),
    executor
      .select({ count: sql<number>`count(*)::int` })
      .from(registrationInvites)
      .innerJoin(registrations, eq(registrationInvites.registrationId, registrations.id))
      .where(
        and(
          eq(registrationInvites.uploadLinkId, link.id),
          eq(registrationInvites.isCurrent, true),
          isNull(registrations.deletedAt),
          or(
            eq(registrations.status, 'confirmed'),
            and(
              inArray(registrations.status, ['started', 'submitted', 'payment_pending']),
              gt(registrations.expiresAt, now),
            ),
          ),
        ),
      ),
  ]);

  const batchCount = batchCountResult[0]?.count ?? 0;
  const inviteCount = inviteCountResult[0]?.count ?? 0;

  const status = resolveUploadLinkStatus({ link, now, batchCount, inviteCount });

  return { link, status, batchCount, inviteCount };
}

export async function getUploadLinkContext(params: {
  token: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const linkResult = await getUploadLinkByToken({ token: params.token, now });

  if (!linkResult.link) {
    return { status: linkResult.status, link: null, event: null, distances: [] as Array<{ id: string; label: string; spotsRemaining: number | null }> };
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, linkResult.link.editionId), isNull(eventEditions.deletedAt)),
    with: {
      series: true,
      distances: {
        where: isNull(eventDistances.deletedAt),
        orderBy: (d, { asc }) => [asc(d.sortOrder)],
      },
    },
  });

  if (!edition?.series) {
    return { status: 'NOT_FOUND' as const, link: null, event: null, distances: [] };
  }

  const distanceIds = edition.distances.map((d) => d.id);
  let registrationCountMap = new Map<string, number>();

  if (distanceIds.length > 0) {
    const regCounts = await db
      .select({
        distanceId: registrations.distanceId,
        count: sql<number>`count(*)`,
      })
      .from(registrations)
      .where(
        and(
          inArray(registrations.distanceId, distanceIds),
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
      )
      .groupBy(registrations.distanceId);

    registrationCountMap = new Map(regCounts.map((r) => [r.distanceId, Number(r.count)]));
  }

  const sharedCapacity = edition.sharedCapacity ?? null;
  const hasSharedPool = Boolean(
    sharedCapacity &&
      edition.distances.some((d) => d.capacityScope === 'shared_pool'),
  );
  let sharedReservedCount = 0;

  if (hasSharedPool) {
    const sharedCounts = await db
      .select({ count: sql<number>`count(*)` })
      .from(registrations)
      .where(
        and(
          eq(registrations.editionId, edition.id),
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
    sharedReservedCount = Number(sharedCounts[0]?.count ?? 0);
  }

  const distances = edition.distances.map((distance) => {
    const regCount = registrationCountMap.get(distance.id) ?? 0;
    const spotsRemaining =
      distance.capacityScope === 'shared_pool' && sharedCapacity
        ? Math.max(sharedCapacity - sharedReservedCount, 0)
        : distance.capacity !== null
          ? Math.max(distance.capacity - regCount, 0)
          : null;

    return {
      id: distance.id,
      label: distance.label,
      spotsRemaining,
    };
  });

  return {
    status: linkResult.status,
    link: linkResult.link,
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
    },
    distances,
    usage: {
      batchCount: linkResult.batchCount,
      inviteCount: linkResult.inviteCount,
    },
  };
}

type InviteStatus = 'draft' | 'sent' | 'claimed' | 'cancelled' | 'expired' | 'superseded';

export type BatchRowWithInvite = {
  id: string;
  rowIndex: number;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string | null;
  validationErrors: string[];
  createdRegistrationId: string | null;
  invite: {
    id: string;
    status: InviteStatus;
    sendCount: number;
    lastSentAt: string | null;
    expiresAt: string | null;
    email: string;
  } | null;
};

export async function getBatchRowsWithInvites(batchId: string): Promise<BatchRowWithInvite[]> {
  const rows = await db
    .select({
      rowId: groupRegistrationBatchRows.id,
      rowIndex: groupRegistrationBatchRows.rowIndex,
      rawJson: groupRegistrationBatchRows.rawJson,
      validationErrors: groupRegistrationBatchRows.validationErrorsJson,
      createdRegistrationId: groupRegistrationBatchRows.createdRegistrationId,
      inviteId: registrationInvites.id,
      inviteStatus: registrationInvites.status,
      inviteEmail: registrationInvites.email,
      inviteSendCount: registrationInvites.sendCount,
      inviteLastSentAt: registrationInvites.lastSentAt,
      inviteExpiresAt: registrationInvites.expiresAt,
    })
    .from(groupRegistrationBatchRows)
    .leftJoin(
      registrationInvites,
      and(
        eq(registrationInvites.batchRowId, groupRegistrationBatchRows.id),
        eq(registrationInvites.isCurrent, true),
      ),
    )
    .where(eq(groupRegistrationBatchRows.batchId, batchId))
    .orderBy(asc(groupRegistrationBatchRows.rowIndex));

  return rows.map((row) => {
    const raw = (row.rawJson ?? {}) as Record<string, unknown>;

    return {
      id: row.rowId,
      rowIndex: row.rowIndex,
      firstName: typeof raw.firstName === 'string' ? raw.firstName : '',
      lastName: typeof raw.lastName === 'string' ? raw.lastName : '',
      email: typeof raw.email === 'string' ? raw.email : '',
      dateOfBirth: typeof raw.dateOfBirth === 'string' ? raw.dateOfBirth : null,
      validationErrors: row.validationErrors ?? [],
      createdRegistrationId: row.createdRegistrationId ?? null,
      invite: row.inviteId
        ? {
            id: row.inviteId,
            status: (row.inviteStatus ?? 'draft') as InviteStatus,
            sendCount: row.inviteSendCount ?? 0,
            lastSentAt: row.inviteLastSentAt ? row.inviteLastSentAt.toISOString() : null,
            expiresAt: row.inviteExpiresAt ? row.inviteExpiresAt.toISOString() : null,
            email: row.inviteEmail ?? '',
          }
        : null,
    };
  });
}

export async function getBatchEditionWithSeries(editionId: string) {
  return db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });
}

export async function getBatchDistance(distanceId: string) {
  return db.query.eventDistances.findFirst({
    where: and(eq(eventDistances.id, distanceId), isNull(eventDistances.deletedAt)),
  });
}
