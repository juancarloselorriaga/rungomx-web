/**
 * E2E Test Database Utilities
 * Follows Jest testing pattern for consistency
 * Loads .env.test for test database connection
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load test environment variables FIRST before any other imports
config({ path: resolve(__dirname, '../../.env.test') });

import { db as appDb } from '@/db';
import * as schema from '@/db/schema';

// Verify DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in .env.test');
}

/**
 * Get database instance for E2E testing
 * Uses DATABASE_URL from .env.test (should point to test branch)
 */
export function getTestDb() {
  return appDb;
}

/**
 * Clean all tables in the database
 * Deletes in FK-safe order to avoid deadlocks on remote Neon instance
 *
 * IMPORTANT: This deletes ALL data from the test database!
 */
export async function cleanDatabase(db: ReturnType<typeof getTestDb>) {
  // Delete in FK-safe order to avoid violations
  // Audit logs first (references organizations, users with onDelete: restrict)
  await db.delete(schema.auditLogs);
  await db.delete(schema.proFeatureUsageEvents);

  // Event-related tables (most dependent)
  // Phase 3 group upload / invites (must be removed before event_distances due to FK + CHECK constraint)
  await db.delete(schema.registrationInvites); // References registrations, batches, upload_links
  await db.delete(schema.groupRegistrationBatchRows); // References registrations, batches
  await db.delete(schema.groupRegistrationBatches); // References event_distances with CHECK involving upload_link_id
  await db.delete(schema.groupUploadLinks); // References event_editions, users

  // Phase 3 group link (small groups)
  await db.delete(schema.registrationGroupMembers); // References registration_groups, users
  await db.delete(schema.registrationGroups); // References event_distances, users

  await db.delete(schema.groupDiscountRules); // References event_editions
  await db.delete(schema.eventSlugRedirects); // Independent (phase 3)

  await db.delete(schema.waiverAcceptances); // References registrations
  await db.delete(schema.registrants); // References registrations, users
  await db.delete(schema.registrations); // References event_distances, users
  await db.delete(schema.pricingTiers); // References event_distances
  await db.delete(schema.eventDistances); // References event_editions
  await db.delete(schema.eventFaqItems); // References event_editions
  await db.delete(schema.eventWebsiteContent); // References event_editions
  await db.delete(schema.eventEditions); // References event_series
  await db.delete(schema.eventSeries); // References organizations
  await db.delete(schema.organizationMemberships); // References organizations, users

  // Delete audit_logs AGAIN right before organizations
  // (in case any were created by cascade triggers during above deletions)
  await db.delete(schema.auditLogs);

  await db.delete(schema.organizations); // Root organization table

  // Auth-related tables
  await db.delete(schema.verifications); // References users (identifier)
  await db.delete(schema.sessions); // References users
  await db.delete(schema.accounts); // References users

  // User-related tables
  await db.delete(schema.userRoles); // References users, roles
  await db.delete(schema.profiles); // References users
  await db.delete(schema.contactSubmissions); // May reference users
  await db.delete(schema.billingPromotionRedemptions);
  await db.delete(schema.billingEntitlementOverrides);
  await db.delete(schema.billingPendingEntitlementGrants);
  await db.delete(schema.billingPromotions);
  await db.delete(schema.billingSubscriptions);
  await db.delete(schema.billingTrialUses);
  await db.delete(schema.billingEvents);
  await db.delete(schema.users); // Root user table

  // Independent tables
  await db.delete(schema.roles); // Root roles table
  await db.delete(schema.media); // May be independent
  await db.delete(schema.rateLimits); // Independent
  await db.delete(schema.waivers); // May be independent
}

/**
 * Reset database to initial state
 * Cleans all data from test database
 */
export async function resetDatabase(db: ReturnType<typeof getTestDb>) {
  await cleanDatabase(db);
}

/**
 * Setup function to run before all E2E tests
 * Cleans database and returns db instance
 */
export async function setupTestDb() {
  const db = getTestDb();
  await resetDatabase(db);
  return db;
}

/**
 * Teardown function to run after all E2E tests
 * Performs final cleanup
 */
export async function teardownTestDb(db: ReturnType<typeof getTestDb>) {
  await cleanDatabase(db);
}
