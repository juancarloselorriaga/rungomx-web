import { and, asc, desc, eq, gt, gte, isNull, lt, or } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  eventSeries,
  registrants,
  registrations,
  waiverAcceptances,
  waivers,
} from '@/db/schema';
import { formatRegistrationTicketCode } from '@/lib/events/tickets';

// =============================================================================
// Types
// =============================================================================

export type MyRegistrationsView = 'upcoming' | 'past' | 'cancelled' | 'in_progress';

export type MyRegistrationListItem = {
  id: string;
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
  ticketCode: string;
  seriesName: string;
  seriesSlug: string;
  editionLabel: string;
  editionSlug: string;
  startsAt: Date | null;
  timezone: string;
  locationDisplay: string | null;
  city: string | null;
  state: string | null;
  distanceLabel: string;
};

export type MyRegistrationDetail = {
  registration: {
    id: string;
    status: string;
    createdAt: Date;
    expiresAt: Date | null;
    basePriceCents: number | null;
    feesCents: number | null;
    taxCents: number | null;
    totalCents: number | null;
  };
  event: {
    seriesName: string;
    seriesSlug: string;
    editionLabel: string;
    editionSlug: string;
    startsAt: Date | null;
    endsAt: Date | null;
    timezone: string;
    locationDisplay: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    externalUrl: string | null;
  };
  distance: {
    id: string;
    label: string;
  };
  registrant: {
    profileSnapshot: {
      firstName?: string;
      lastName?: string;
      email?: string;
      dateOfBirth?: string;
      gender?: string;
      phone?: string;
      city?: string;
      state?: string;
      country?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
    } | null;
  } | null;
  waiverAcceptances: {
    title: string;
    acceptedAt: Date;
    signatureType: string;
  }[];
};

export type ActiveRegistrationInfo = {
  registrationId: string;
  distanceId: string;
  distanceLabel: string;
  status: 'started' | 'submitted' | 'payment_pending' | 'confirmed';
  expiresAt: Date | null;
};

// =============================================================================
// Queries
// =============================================================================

export async function getMyRegistrations(
  userId: string,
  options: { view: MyRegistrationsView; now?: Date },
): Promise<MyRegistrationListItem[]> {
  const now = options.now ?? new Date();
  const conditions = [
    eq(registrations.buyerUserId, userId),
    isNull(registrations.deletedAt),
    isNull(eventEditions.deletedAt),
    isNull(eventSeries.deletedAt),
    isNull(eventDistances.deletedAt),
  ];

  switch (options.view) {
    case 'upcoming':
      const upcomingStatus = or(
        eq(registrations.status, 'confirmed'),
        eq(registrations.status, 'payment_pending'),
      );
      if (upcomingStatus) {
        conditions.push(upcomingStatus);
      }
      const upcomingDates = or(isNull(eventEditions.startsAt), gte(eventEditions.startsAt, now));
      if (upcomingDates) {
        conditions.push(upcomingDates);
      }
      break;
    case 'past':
      const pastStatus = or(
        eq(registrations.status, 'confirmed'),
        eq(registrations.status, 'payment_pending'),
      );
      if (pastStatus) {
        conditions.push(pastStatus);
      }
      conditions.push(lt(eventEditions.startsAt, now));
      break;
    case 'cancelled':
      conditions.push(eq(registrations.status, 'cancelled'));
      break;
    case 'in_progress':
      const inProgressStatus = or(
        eq(registrations.status, 'started'),
        eq(registrations.status, 'submitted'),
      );
      if (inProgressStatus) {
        conditions.push(inProgressStatus);
      }
      break;
  }

  const rows = await db
    .select({
      id: registrations.id,
      status: registrations.status,
      createdAt: registrations.createdAt,
      expiresAt: registrations.expiresAt,
      seriesName: eventSeries.name,
      seriesSlug: eventSeries.slug,
      editionLabel: eventEditions.editionLabel,
      editionSlug: eventEditions.slug,
      startsAt: eventEditions.startsAt,
      timezone: eventEditions.timezone,
      locationDisplay: eventEditions.locationDisplay,
      city: eventEditions.city,
      state: eventEditions.state,
      distanceLabel: eventDistances.label,
    })
    .from(registrations)
    .innerJoin(eventEditions, eq(registrations.editionId, eventEditions.id))
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .innerJoin(eventDistances, eq(registrations.distanceId, eventDistances.id))
    .where(and(...conditions))
    .orderBy(desc(registrations.createdAt));

  const items = rows.map((row) => ({
    ...row,
    ticketCode: formatRegistrationTicketCode(row.id),
  }));

  const sortByUpcoming = (a: MyRegistrationListItem, b: MyRegistrationListItem) => {
    if (a.startsAt && b.startsAt) {
      return a.startsAt.getTime() - b.startsAt.getTime();
    }
    if (a.startsAt && !b.startsAt) {
      return -1;
    }
    if (!a.startsAt && b.startsAt) {
      return 1;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  };

  const sortByPast = (a: MyRegistrationListItem, b: MyRegistrationListItem) =>
    (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0);

  if (options.view === 'upcoming') {
    return [...items].sort(sortByUpcoming);
  }
  if (options.view === 'past') {
    return [...items].sort(sortByPast);
  }
  return items;
}

export async function getMyRegistrationDetail(
  userId: string,
  registrationId: string,
): Promise<MyRegistrationDetail | null> {
  const [registration] = await db
    .select({
      id: registrations.id,
      status: registrations.status,
      createdAt: registrations.createdAt,
      expiresAt: registrations.expiresAt,
      basePriceCents: registrations.basePriceCents,
      feesCents: registrations.feesCents,
      taxCents: registrations.taxCents,
      totalCents: registrations.totalCents,
      seriesName: eventSeries.name,
      seriesSlug: eventSeries.slug,
      editionLabel: eventEditions.editionLabel,
      editionSlug: eventEditions.slug,
      startsAt: eventEditions.startsAt,
      endsAt: eventEditions.endsAt,
      timezone: eventEditions.timezone,
      locationDisplay: eventEditions.locationDisplay,
      address: eventEditions.address,
      city: eventEditions.city,
      state: eventEditions.state,
      country: eventEditions.country,
      externalUrl: eventEditions.externalUrl,
      distanceId: eventDistances.id,
      distanceLabel: eventDistances.label,
    })
    .from(registrations)
    .innerJoin(eventEditions, eq(registrations.editionId, eventEditions.id))
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .innerJoin(eventDistances, eq(registrations.distanceId, eventDistances.id))
    .where(
      and(
        eq(registrations.id, registrationId),
        eq(registrations.buyerUserId, userId),
        isNull(registrations.deletedAt),
        isNull(eventEditions.deletedAt),
        isNull(eventSeries.deletedAt),
        isNull(eventDistances.deletedAt),
      ),
    )
    .limit(1);

  if (!registration) {
    return null;
  }

  const registrant = await db.query.registrants.findFirst({
    where: and(eq(registrants.registrationId, registrationId), isNull(registrants.deletedAt)),
  });

  const waiverRows = await db
    .select({
      title: waivers.title,
      acceptedAt: waiverAcceptances.acceptedAt,
      signatureType: waiverAcceptances.signatureType,
    })
    .from(waiverAcceptances)
    .innerJoin(waivers, eq(waiverAcceptances.waiverId, waivers.id))
    .where(and(eq(waiverAcceptances.registrationId, registrationId), isNull(waivers.deletedAt)))
    .orderBy(asc(waiverAcceptances.acceptedAt));

  return {
    registration: {
      id: registration.id,
      status: registration.status,
      createdAt: registration.createdAt,
      expiresAt: registration.expiresAt,
      basePriceCents: registration.basePriceCents,
      feesCents: registration.feesCents,
      taxCents: registration.taxCents,
      totalCents: registration.totalCents,
    },
    event: {
      seriesName: registration.seriesName,
      seriesSlug: registration.seriesSlug,
      editionLabel: registration.editionLabel,
      editionSlug: registration.editionSlug,
      startsAt: registration.startsAt,
      endsAt: registration.endsAt,
      timezone: registration.timezone,
      locationDisplay: registration.locationDisplay,
      address: registration.address,
      city: registration.city,
      state: registration.state,
      country: registration.country,
      externalUrl: registration.externalUrl,
    },
    distance: {
      id: registration.distanceId,
      label: registration.distanceLabel,
    },
    registrant: registrant
      ? {
          profileSnapshot: registrant.profileSnapshot ?? null,
        }
      : null,
    waiverAcceptances: waiverRows.map((row) => ({
      title: row.title,
      acceptedAt: row.acceptedAt,
      signatureType: row.signatureType,
    })),
  };
}

/**
 * Check if user has an active registration for an event edition.
 * Active means:
 * - status === 'confirmed' AND deletedAt IS NULL
 * - OR status IN ('started', 'submitted', 'payment_pending') AND expiresAt > NOW() AND deletedAt IS NULL
 */
export async function getActiveRegistrationForEdition(
  userId: string,
  editionId: string,
): Promise<ActiveRegistrationInfo | null> {
  const now = new Date();

  const [registration] = await db
    .select({
      registrationId: registrations.id,
      distanceId: registrations.distanceId,
      distanceLabel: eventDistances.label,
      status: registrations.status,
      expiresAt: registrations.expiresAt,
    })
    .from(registrations)
    .innerJoin(eventDistances, eq(registrations.distanceId, eventDistances.id))
    .where(
      and(
        eq(registrations.buyerUserId, userId),
        eq(registrations.editionId, editionId),
        isNull(registrations.deletedAt),
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
      ),
    )
    .orderBy(desc(registrations.createdAt))
    .limit(1);

  if (!registration) {
    return null;
  }

  return {
    registrationId: registration.registrationId,
    distanceId: registration.distanceId,
    distanceLabel: registration.distanceLabel,
    status: registration.status as ActiveRegistrationInfo['status'],
    expiresAt: registration.expiresAt,
  };
}
