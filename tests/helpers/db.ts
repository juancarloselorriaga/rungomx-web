import { closeDbPool, db as appDb } from '@/db';
import * as schema from '@/db/schema';
import { assertDatabaseTargetMatch, describeDatabaseTarget, readEnvFileValue } from '@/testing/db-target';
import { resolve } from 'path';

type TestDb = typeof appDb;

const ENV_TEST_PATH = resolve(process.cwd(), '.env.test');

function getExpectedTestDatabaseUrl() {
  return process.env.DATABASE_TEST_URL ?? readEnvFileValue(ENV_TEST_PATH, 'DATABASE_URL') ?? undefined;
}

function assertTestDatabaseTarget(operationLabel: string) {
  const runtimeUrl = process.env.DATABASE_TEST_URL ?? process.env.DATABASE_URL;
  return assertDatabaseTargetMatch({
    runtimeUrl,
    runtimeSource: 'DATABASE_TEST_URL/DATABASE_URL',
    expectedUrl: getExpectedTestDatabaseUrl(),
    expectedSource: `DATABASE_TEST_URL or ${ENV_TEST_PATH}:DATABASE_URL`,
    operationLabel: `DB tests (${operationLabel})`,
  });
}

function formatDbError(error: unknown): string {
  const err = error as {
    message?: string;
    cause?: {
      message?: string;
      code?: string;
      detail?: string;
      hint?: string;
      table?: string;
      schema?: string;
      constraint?: string;
      severity?: string;
    };
  };

  const details = [
    `message=${err?.message ?? 'unknown'}`,
    `cause.message=${err?.cause?.message ?? 'unknown'}`,
    `cause.code=${err?.cause?.code ?? 'unknown'}`,
    `cause.constraint=${err?.cause?.constraint ?? 'unknown'}`,
    `cause.table=${err?.cause?.table ?? 'unknown'}`,
    `cause.schema=${err?.cause?.schema ?? 'unknown'}`,
    `cause.detail=${err?.cause?.detail ?? 'unknown'}`,
    `cause.hint=${err?.cause?.hint ?? 'unknown'}`,
    `cause.severity=${err?.cause?.severity ?? 'unknown'}`,
  ];

  return details.join(', ');
}

/**
 * Get database instance for testing
 * Uses DATABASE_TEST_URL when available, otherwise DATABASE_URL.
 */
export function getTestDb() {
  assertTestDatabaseTarget('getTestDb');

  return appDb;
}

export async function closeTestDbPool() {
  await closeDbPool();
}

/**
 * Clean all tables in the database
 * Useful for ensuring clean state between tests
 */
export async function cleanDatabase(db: TestDb) {
  const runtimeTarget = assertTestDatabaseTarget('cleanDatabase');

  try {
    // Keep this aligned with e2e/utils/db.ts so DB and E2E suites share a deterministic FK-safe order.
    const deleteAuditLogs = async () => {
      await db.delete(schema.auditLogs);
    };

    // Phase 1: early cleanup
    // audit_logs has RESTRICT FKs to users/organizations, so clear it before root-table deletes.
    await deleteAuditLogs();
    await db.delete(schema.proFeatureUsageEvents);

    // Event-related tables (most dependent first)
    await db.delete(schema.registrationInvites); // References registrations, batches, upload links
    await db.delete(schema.groupRegistrationBatchRows); // References registrations, batches
    await db.delete(schema.groupRegistrationBatches); // References event_distances (+ upload-link check)
    await db.delete(schema.groupUploadLinks); // References event editions, users
    await db.delete(schema.registrationGroupMembers); // References registration groups, users
    await db.delete(schema.registrationGroups); // References event distances, users
    await db.delete(schema.groupDiscountRules);
    await db.delete(schema.eventSlugRedirects);
    await db.delete(schema.waiverAcceptances);
    await db.delete(schema.registrants);
    await db.delete(schema.registrations);
    await db.delete(schema.pricingTiers);
    await db.delete(schema.eventDistances);
    await db.delete(schema.eventFaqItems);
    await db.delete(schema.eventWebsiteContent);
    await db.delete(schema.eventEditions);
    await db.delete(schema.eventSeries);
    await db.delete(schema.organizationMemberships);

    // Phase 2: late cleanup
    // Run audit cleanup again right before organizations to capture rows produced by intermediate deletes.
    await deleteAuditLogs();

    await db.delete(schema.organizations);

    // Auth-related tables
    await db.delete(schema.verifications);
    await db.delete(schema.sessions);
    await db.delete(schema.accounts);

    // User-related / billing tables
    await db.delete(schema.userRoles);
    await db.delete(schema.profiles);
    await db.delete(schema.contactSubmissions);
    await db.delete(schema.billingPromotionRedemptions);
    await db.delete(schema.billingEntitlementOverrides);
    await db.delete(schema.billingPendingEntitlementGrants);
    await db.delete(schema.billingPromotions);
    await db.delete(schema.billingSubscriptions);
    await db.delete(schema.billingTrialUses);
    await db.delete(schema.billingEvents);
    await db.delete(schema.users);

    // Independent tables
    await db.delete(schema.roles);
    await db.delete(schema.media);
    await db.delete(schema.rateLimits);
    await db.delete(schema.waivers);
  } catch (error) {
    throw new Error(
      `cleanDatabase failed on target=${describeDatabaseTarget(runtimeTarget)}. ${formatDbError(error)}`,
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

/**
 * Reset database to initial state
 * Runs migrations and cleans all data
 */
export async function resetDatabase(db: ReturnType<typeof getTestDb>) {
  await cleanDatabase(db);
}

/**
 * Setup function to run before all tests
 */
export async function setupTestDb() {
  const db = getTestDb();
  await resetDatabase(db);
  return db;
}

/**
 * Teardown function to run after all tests
 */
export async function teardownTestDb(db: ReturnType<typeof getTestDb>) {
  await cleanDatabase(db);
}
