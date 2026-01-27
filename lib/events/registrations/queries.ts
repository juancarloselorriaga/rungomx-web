import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  addOnOptions,
  addOnSelections,
  registrants,
  registrationQuestions,
  registrations,
  users,
} from '@/db/schema';
import type { RegistrationStatus } from '../constants';

// =============================================================================
// Types
// =============================================================================

export type RegistrationListItem = {
  id: string;
  status: RegistrationStatus;
  createdAt: Date;
  basePriceCents: number | null;
  totalCents: number | null;
  buyer: {
    id: string | null;
    name: string;
    email: string;
  };
  distance: {
    id: string;
    label: string;
  };
  registrant: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
};

export type RegistrationFilters = {
  editionId: string;
  distanceId?: string;
  status?: RegistrationStatus;
  search?: string;
  createdFrom?: Date;
  createdTo?: Date;
  sortBy?: 'createdAt' | 'name' | 'status';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};

export type RegistrationExportData = {
  id: string;
  status: string;
  createdAt: string;
  basePriceCents: number | null;
  feesCents: number | null;
  totalCents: number | null;
  discountAmountCents: number | null;
  discountCode: string | null;
  buyerName: string;
  buyerEmail: string;
  distanceLabel: string;
  // Registrant info
  registrantFirstName: string | null;
  registrantLastName: string | null;
  registrantEmail: string | null;
  registrantPhone: string | null;
  registrantDateOfBirth: string | null;
  registrantGender: string | null;
  registrantCity: string | null;
  registrantState: string | null;
  registrantCountry: string | null;
  registrantEmergencyContactName: string | null;
  registrantEmergencyContactPhone: string | null;
  // Waiver info
  waiversAccepted: boolean;
  waiverAcceptedAt: string | null;
  // Custom answers
  customAnswers: Record<string, string | null>;
  // Add-ons
  addOnSelections: Array<{
    addOnTitle: string;
    optionLabel: string;
    quantity: number;
    lineTotalCents: number;
  }>;
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Get paginated list of registrations for an edition with filters.
 */
export async function getRegistrationsForEdition(
  filters: RegistrationFilters,
): Promise<{ items: RegistrationListItem[]; total: number }> {
  const {
    editionId,
    distanceId,
    status,
    search,
    createdFrom,
    createdTo,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    limit = 25,
    offset = 0,
  } = filters;

  // Build where conditions
  const whereConditions = [
    eq(registrations.editionId, editionId),
    isNull(registrations.deletedAt),
  ];

  if (distanceId) {
    whereConditions.push(eq(registrations.distanceId, distanceId));
  }

  if (status) {
    whereConditions.push(eq(registrations.status, status));
  }

  if (createdFrom) {
    whereConditions.push(gte(registrations.createdAt, createdFrom));
  }

  if (createdTo) {
    whereConditions.push(lte(registrations.createdAt, createdTo));
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(registrations)
    .leftJoin(users, eq(registrations.buyerUserId, users.id))
    .where(
      search
        ? and(
            ...whereConditions,
            or(
              ilike(users.name, `%${search}%`),
              ilike(users.email, `%${search}%`),
            ),
          )
        : and(...whereConditions),
    );

  const total = countResult[0].count;

  // Build order by
  const orderByClause =
    sortBy === 'name'
      ? sortOrder === 'asc'
        ? asc(sql`coalesce(${users.name}, '')`)
        : desc(sql`coalesce(${users.name}, '')`)
      : sortBy === 'status'
        ? sortOrder === 'asc'
          ? asc(registrations.status)
          : desc(registrations.status)
        : sortOrder === 'asc'
          ? asc(registrations.createdAt)
          : desc(registrations.createdAt);

  // Fetch items
  const items = await db.query.registrations.findMany({
    where: search
      ? and(
          ...whereConditions,
          or(
            sql`EXISTS (SELECT 1 FROM users WHERE users.id = ${registrations.buyerUserId} AND (users.name ILIKE ${`%${search}%`} OR users.email ILIKE ${`%${search}%`}))`,
          ),
        )
      : and(...whereConditions),
    orderBy: [orderByClause],
    limit,
    offset,
    with: {
      buyer: {
        columns: { id: true, name: true, email: true },
      },
      distance: {
        columns: { id: true, label: true },
      },
      registrants: {
        limit: 1,
        where: isNull(registrants.deletedAt),
      },
    },
  });

  return {
    items: items.map((r) => ({
      id: r.id,
      status: r.status as RegistrationStatus,
      createdAt: r.createdAt,
      basePriceCents: r.basePriceCents,
      totalCents: r.totalCents,
      buyer: r.buyer
        ? {
            id: r.buyer.id,
            name: r.buyer.name,
            email: r.buyer.email,
          }
        : {
            id: null,
            name: 'Unclaimed',
            email: '',
          },
      distance: {
        id: r.distance.id,
        label: r.distance.label,
      },
      registrant: r.registrants[0]
        ? {
            id: r.registrants[0].id,
            firstName: r.registrants[0].profileSnapshot?.firstName ?? null,
            lastName: r.registrants[0].profileSnapshot?.lastName ?? null,
            email: r.registrants[0].profileSnapshot?.email ?? null,
          }
        : null,
    })),
    total,
  };
}

/**
 * Get full registration data for export.
 */
export async function getRegistrationsForExport(
  editionId: string,
  filters?: {
    distanceId?: string;
    status?: RegistrationStatus;
    search?: string;
    createdFrom?: Date;
    createdTo?: Date;
  },
): Promise<RegistrationExportData[]> {
  const whereConditions = [
    eq(registrations.editionId, editionId),
    isNull(registrations.deletedAt),
  ];

  if (filters?.distanceId) {
    whereConditions.push(eq(registrations.distanceId, filters.distanceId));
  }

  if (filters?.status) {
    whereConditions.push(eq(registrations.status, filters.status));
  }

  if (filters?.createdFrom) {
    whereConditions.push(gte(registrations.createdAt, filters.createdFrom));
  }

  if (filters?.createdTo) {
    whereConditions.push(lte(registrations.createdAt, filters.createdTo));
  }

  // Get all questions for this edition for column headers
  const questions = await db.query.registrationQuestions.findMany({
    where: and(
      eq(registrationQuestions.editionId, editionId),
      isNull(registrationQuestions.deletedAt),
    ),
    orderBy: [asc(registrationQuestions.sortOrder)],
  });

  const registrationList = await db.query.registrations.findMany({
    where: filters?.search
      ? and(
          ...whereConditions,
          or(
            sql`EXISTS (SELECT 1 FROM users WHERE users.id = ${registrations.buyerUserId} AND (users.name ILIKE ${`%${filters.search}%`} OR users.email ILIKE ${`%${filters.search}%`}))`,
          ),
        )
      : and(...whereConditions),
    orderBy: [asc(registrations.createdAt)],
    with: {
      buyer: {
        columns: { id: true, name: true, email: true },
      },
      distance: {
        columns: { id: true, label: true },
      },
      registrants: {
        limit: 1,
        where: isNull(registrants.deletedAt),
      },
      waiverAcceptances: {
        limit: 1,
      },
      discountRedemptions: {
        with: {
          discountCode: {
            columns: { code: true },
          },
        },
      },
      registrationAnswers: true,
      addOnSelections: {
        where: isNull(addOnSelections.deletedAt),
        with: {
          option: {
            with: {
              addOn: {
                columns: { title: true },
              },
            },
          },
        },
      },
    },
  });

  return registrationList.map((r) => {
    const registrant = r.registrants[0];
    const profile = registrant?.profileSnapshot;
    const waiverAcceptance = r.waiverAcceptances[0];
    const discount = r.discountRedemptions[0];

    // Build custom answers map
    const customAnswers: Record<string, string | null> = {};
    for (const question of questions) {
      const answer = r.registrationAnswers.find((a) => a.questionId === question.id);
      customAnswers[question.prompt] = answer?.value ?? null;
    }

    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      basePriceCents: r.basePriceCents,
      feesCents: r.feesCents,
      totalCents: r.totalCents,
      discountAmountCents: discount?.discountAmountCents ?? null,
      discountCode: discount?.discountCode.code ?? null,
      buyerName: r.buyer?.name ?? 'Unclaimed',
      buyerEmail: r.buyer?.email ?? '',
      distanceLabel: r.distance.label,
      registrantFirstName: profile?.firstName ?? null,
      registrantLastName: profile?.lastName ?? null,
      registrantEmail: profile?.email ?? null,
      registrantPhone: profile?.phone ?? null,
      registrantDateOfBirth: profile?.dateOfBirth ?? null,
      registrantGender: profile?.gender ?? null,
      registrantCity: profile?.city ?? null,
      registrantState: profile?.state ?? null,
      registrantCountry: profile?.country ?? null,
      registrantEmergencyContactName: profile?.emergencyContactName ?? null,
      registrantEmergencyContactPhone: profile?.emergencyContactPhone ?? null,
      waiversAccepted: Boolean(waiverAcceptance),
      waiverAcceptedAt: waiverAcceptance?.acceptedAt?.toISOString() ?? null,
      customAnswers,
      addOnSelections: r.addOnSelections.map((s) => ({
        addOnTitle: s.option.addOn.title,
        optionLabel: s.option.label,
        quantity: s.quantity,
        lineTotalCents: s.lineTotalCents,
      })),
    };
  });
}

/**
 * Get add-on sales summary for an edition.
 */
export async function getAddOnSalesSummary(editionId: string) {
  const result = await db
    .select({
      addOnId: sql<string>`${addOnOptions}.add_on_id`,
      addOnTitle: sql<string>`add_ons.title`,
      optionId: addOnOptions.id,
      optionLabel: addOnOptions.label,
      totalQuantity: sql<number>`sum(${addOnSelections}.quantity)::int`,
      totalRevenueCents: sql<number>`sum(${addOnSelections}.line_total_cents)::int`,
    })
    .from(addOnSelections)
    .innerJoin(addOnOptions, eq(addOnSelections.optionId, addOnOptions.id))
    .innerJoin(sql`add_ons`, sql`add_ons.id = ${addOnOptions}.add_on_id`)
    .innerJoin(registrations, eq(addOnSelections.registrationId, registrations.id))
    .where(
      and(
        eq(registrations.editionId, editionId),
        isNull(addOnSelections.deletedAt),
        isNull(registrations.deletedAt),
      ),
    )
    .groupBy(sql`${addOnOptions}.add_on_id`, sql`add_ons.title`, addOnOptions.id, addOnOptions.label);

  return result;
}
