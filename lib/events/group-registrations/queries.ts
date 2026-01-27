import { desc, eq, sql } from 'drizzle-orm';
import { connection } from 'next/server';

import { db } from '@/db';
import {
  groupDiscountRules,
  groupRegistrationBatchRows,
  groupRegistrationBatches,
  users,
} from '@/db/schema';

export type GroupRegistrationBatchListItem = {
  id: string;
  status: string;
  createdAt: Date;
  processedAt: Date | null;
  createdBy: { id: string; name: string; email: string };
  rowCount: number;
  errorCount: number;
};

export async function getGroupRegistrationBatchesForEdition(
  editionId: string,
): Promise<GroupRegistrationBatchListItem[]> {
  if (process.env.NODE_ENV !== 'test') {
    await connection();
  }

  const rows = await db
    .select({
      id: groupRegistrationBatches.id,
      status: groupRegistrationBatches.status,
      createdAt: groupRegistrationBatches.createdAt,
      processedAt: groupRegistrationBatches.processedAt,
      createdById: users.id,
      createdByName: users.name,
      createdByEmail: users.email,
      rowCount: sql<number>`count(${groupRegistrationBatchRows.id})::int`,
      errorCount: sql<number>`sum(case when jsonb_array_length(${groupRegistrationBatchRows.validationErrorsJson}) > 0 then 1 else 0 end)::int`,
    })
    .from(groupRegistrationBatches)
    .innerJoin(users, eq(groupRegistrationBatches.createdByUserId, users.id))
    .leftJoin(groupRegistrationBatchRows, eq(groupRegistrationBatchRows.batchId, groupRegistrationBatches.id))
    .where(eq(groupRegistrationBatches.editionId, editionId))
    .groupBy(groupRegistrationBatches.id, users.id)
    .orderBy(desc(groupRegistrationBatches.createdAt));

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    processedAt: r.processedAt,
    createdBy: { id: r.createdById, name: r.createdByName, email: r.createdByEmail },
    rowCount: Number(r.rowCount) || 0,
    errorCount: Number(r.errorCount) || 0,
  }));
}

export type GroupRegistrationBatchRowDetail = {
  id: string;
  rowIndex: number;
  rawJson: Record<string, unknown>;
  validationErrors: string[];
  createdRegistrationId: string | null;
};

export type GroupRegistrationBatchDetail = {
  id: string;
  editionId: string;
  status: string;
  createdAt: Date;
  processedAt: Date | null;
  createdBy: { id: string; name: string; email: string };
  rows: GroupRegistrationBatchRowDetail[];
};

export async function getGroupRegistrationBatchDetail(
  batchId: string,
): Promise<GroupRegistrationBatchDetail | null> {
  if (process.env.NODE_ENV !== 'test') {
    await connection();
  }

  const batch = await db.query.groupRegistrationBatches.findFirst({
    where: eq(groupRegistrationBatches.id, batchId),
    with: {
      createdByUser: {
        columns: { id: true, name: true, email: true },
      },
      rows: {
        orderBy: (r, { asc }) => [asc(r.rowIndex)],
      },
    },
  });

  if (!batch?.createdByUser) return null;

  return {
    id: batch.id,
    editionId: batch.editionId,
    status: batch.status,
    createdAt: batch.createdAt,
    processedAt: batch.processedAt,
    createdBy: {
      id: batch.createdByUser.id,
      name: batch.createdByUser.name,
      email: batch.createdByUser.email,
    },
    rows: batch.rows.map((r) => ({
      id: r.id,
      rowIndex: r.rowIndex,
      rawJson: r.rawJson ?? {},
      validationErrors: r.validationErrorsJson ?? [],
      createdRegistrationId: r.createdRegistrationId,
    })),
  };
}

export type GroupDiscountRuleDetail = {
  id: string;
  minParticipants: number;
  percentOff: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function getGroupDiscountRulesForEdition(
  editionId: string,
): Promise<GroupDiscountRuleDetail[]> {
  if (process.env.NODE_ENV !== 'test') {
    await connection();
  }

  const rows = await db.query.groupDiscountRules.findMany({
    where: eq(groupDiscountRules.editionId, editionId),
    orderBy: (r, { asc }) => [asc(r.minParticipants)],
  });

  return rows.map((r) => ({
    id: r.id,
    minParticipants: r.minParticipants,
    percentOff: r.percentOff,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}
