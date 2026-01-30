import { and, eq, gt, inArray, isNull, ne } from 'drizzle-orm';

import { db } from '@/db';
import { eventDistances, eventEditions, eventSeries, registrationInvites, registrations } from '@/db/schema';
import { hashToken } from '@/lib/events/group-upload/tokens';

type DbLike = Pick<typeof db, 'select'>;

export async function getCurrentInviteForEmail(params: {
  editionId: string;
  emailNormalized: string;
  now?: Date;
  tx?: DbLike;
}) {
  const now = params.now ?? new Date();
  const executor = params.tx ?? db;

  const [row] = await executor
    .select({
      inviteId: registrationInvites.id,
      registrationId: registrationInvites.registrationId,
      status: registrationInvites.status,
      expiresAt: registrationInvites.expiresAt,
    })
    .from(registrationInvites)
    .innerJoin(registrations, eq(registrationInvites.registrationId, registrations.id))
    .where(
      and(
        eq(registrationInvites.editionId, params.editionId),
        eq(registrationInvites.emailNormalized, params.emailNormalized),
        eq(registrationInvites.isCurrent, true),
        inArray(registrationInvites.status, ['draft', 'sent']),
        isNull(registrations.buyerUserId),
        isNull(registrations.deletedAt),
        gt(registrations.expiresAt, now),
        ne(registrations.status, 'cancelled'),
      ),
    );

  return row ?? null;
}

export async function getClaimPageContextByToken(params: { token: string; now?: Date }) {
  const now = params.now ?? new Date();
  const tokenHash = hashToken(params.token);

  const [row] = await db
    .select({
      inviteId: registrationInvites.id,
      inviteStatus: registrationInvites.status,
      isCurrent: registrationInvites.isCurrent,
      expiresAt: registrationInvites.expiresAt,
      registrationStatus: registrations.status,
      registrationExpiresAt: registrations.expiresAt,
      seriesSlug: eventSeries.slug,
      seriesName: eventSeries.name,
      editionSlug: eventEditions.slug,
      editionLabel: eventEditions.editionLabel,
      distanceLabel: eventDistances.label,
    })
    .from(registrationInvites)
    .innerJoin(registrations, eq(registrationInvites.registrationId, registrations.id))
    .innerJoin(eventEditions, eq(registrationInvites.editionId, eventEditions.id))
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .innerJoin(eventDistances, eq(registrations.distanceId, eventDistances.id))
    .where(eq(registrationInvites.tokenHash, tokenHash));

  if (!row) {
    return { status: 'NOT_FOUND' as const, event: null };
  }

  const isExpired =
    row.inviteStatus === 'expired' ||
    row.registrationStatus === 'cancelled' ||
    (row.registrationStatus !== 'confirmed' &&
      (!row.registrationExpiresAt || row.registrationExpiresAt <= now));

  if (row.inviteStatus === 'cancelled') {
    return {
      status: 'CANCELLED' as const,
      event: {
        seriesSlug: row.seriesSlug,
        seriesName: row.seriesName,
        editionSlug: row.editionSlug,
        editionLabel: row.editionLabel,
        distanceLabel: row.distanceLabel,
      },
    };
  }

  if (isExpired) {
    return {
      status: 'EXPIRED' as const,
      event: {
        seriesSlug: row.seriesSlug,
        seriesName: row.seriesName,
        editionSlug: row.editionSlug,
        editionLabel: row.editionLabel,
        distanceLabel: row.distanceLabel,
      },
    };
  }

  if (row.inviteStatus === 'claimed') {
    return {
      status: 'CLAIMED' as const,
      event: {
        seriesSlug: row.seriesSlug,
        seriesName: row.seriesName,
        editionSlug: row.editionSlug,
        editionLabel: row.editionLabel,
        distanceLabel: row.distanceLabel,
      },
    };
  }

  if (!row.isCurrent || row.inviteStatus === 'superseded') {
    return { status: 'INVALID' as const, event: null };
  }

  return {
    status: 'ACTIVE' as const,
    event: {
      seriesSlug: row.seriesSlug,
      seriesName: row.seriesName,
      editionSlug: row.editionSlug,
      editionLabel: row.editionLabel,
      distanceLabel: row.distanceLabel,
    },
  };
}
