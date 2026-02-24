import {
  AnyPgColumn,
  boolean,
  check,
  date,
  decimal,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// =============================================================================
// ENUMS
// =============================================================================

export const organizationRoleEnum = pgEnum('organization_role', ['owner', 'admin', 'editor', 'viewer']);
export const paymentResponsibilityEnum = pgEnum('payment_responsibility', [
  'self_pay',
  'central_pay',
]);
export const moneyMutationSourceEnum = pgEnum('money_mutation_source', [
  'api',
  'server_action',
  'worker',
  'scheduler',
]);
export const moneyCommandIngestionStatusEnum = pgEnum('money_command_ingestion_status', [
  'processing',
  'completed',
  'failed',
  'duplicate',
]);
export const refundRequestStatusEnum = pgEnum('refund_request_status', [
  'pending_organizer_decision',
  'approved',
  'denied',
  'escalated_admin_review',
  'executed',
  'cancelled',
]);
export const disputeCaseStatusEnum = pgEnum('dispute_case_status', [
  'opened',
  'evidence_required',
  'under_review',
  'won',
  'lost',
  'cancelled',
]);

// =============================================================================
// USER & AUTH TABLES
// =============================================================================

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    deletedByUserId: uuid('deleted_by_user_id'),
  },
  (table) => [
    foreignKey({
      name: 'users_deleted_by_user_fk',
      columns: [table.deletedByUserId],
      foreignColumns: [table.id],
    }).onDelete('set null'),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    providerId: varchar('provider_id', { length: 50 }).notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    userIdIdx: uniqueIndex('accounts_user_id_idx').on(table.userId),
  }),
);

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

export const verifications = pgTable('verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  bio: varchar('bio', { length: 500 }),
  dateOfBirth: date('date_of_birth', { mode: 'date' }),
  gender: varchar('gender', { length: 20 }),
  genderDescription: varchar('gender_description', { length: 100 }),
  phone: varchar('phone', { length: 20 }),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  postalCode: varchar('postal_code', { length: 10 }),
  country: varchar('country', { length: 2 }).default('MX').notNull(),
  locale: varchar('locale', { length: 2 }),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  locationDisplay: varchar('location_display', { length: 255 }),
  emergencyContactName: varchar('emergency_contact_name', { length: 100 }),
  emergencyContactPhone: varchar('emergency_contact_phone', { length: 20 }),
  medicalConditions: text('medical_conditions'),
  bloodType: varchar('blood_type', { length: 5 }),
  shirtSize: varchar('shirt_size', { length: 10 }),
  weightKg: decimal('weight_kg', { precision: 5, scale: 2 }),
  heightCm: integer('height_cm'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 50 }).notNull().unique(),
    description: varchar('description', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    nameIdx: uniqueIndex('roles_name_idx').on(table.name),
  }),
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    userRoleUnique: uniqueIndex('user_roles_user_id_role_id_idx').on(table.userId, table.roleId),
  }),
);

export const contactSubmissions = pgTable('contact_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  message: text('message').notNull(),
  origin: varchar('origin', { length: 100 }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const rateLimits = pgTable(
  'rate_limits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    identifier: varchar('identifier', { length: 255 }).notNull(),
    identifierType: varchar('identifier_type', { length: 20 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    count: integer('count').notNull().default(1),
    windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    identifierActionIdx: uniqueIndex('rate_limits_identifier_type_action_idx').on(
      table.identifier,
      table.identifierType,
      table.action,
    ),
    expiresAtIdx: index('rate_limits_expires_at_idx').on(table.expiresAt),
  }),
);

// =============================================================================
// BILLING TABLES (Pro Subscriptions + Promotions)
// =============================================================================

export const billingSubscriptions = pgTable(
  'billing_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planKey: varchar('plan_key', { length: 50 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(), // 'trialing' | 'active' | 'ended'
    trialStartsAt: timestamp('trial_starts_at', { withTimezone: true, mode: 'date' }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'date' }),
    currentPeriodStartsAt: timestamp('current_period_starts_at', {
      withTimezone: true,
      mode: 'date',
    }),
    currentPeriodEndsAt: timestamp('current_period_ends_at', { withTimezone: true, mode: 'date' }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
    provider: varchar('provider', { length: 50 }),
    providerCustomerId: varchar('provider_customer_id', { length: 255 }),
    providerSubscriptionId: varchar('provider_subscription_id', { length: 255 }),
    providerPriceId: varchar('provider_price_id', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('billing_subscriptions_user_id_idx').on(table.userId),
    index('billing_subscriptions_trial_ends_at_idx').on(table.trialEndsAt),
    index('billing_subscriptions_current_period_ends_at_idx').on(table.currentPeriodEndsAt),
    index('billing_subscriptions_ended_at_idx').on(table.endedAt),
    check(
      'billing_subscriptions_trial_window_check',
      sql`${table.trialEndsAt} > ${table.trialStartsAt}`,
    ),
    check(
      'billing_subscriptions_period_window_check',
      sql`${table.currentPeriodEndsAt} > ${table.currentPeriodStartsAt}`,
    ),
  ],
);

export const billingTrialUses = pgTable('billing_trial_uses', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }).notNull(),
  source: varchar('source', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const billingEntitlementOverrides = pgTable(
  'billing_entitlement_overrides',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entitlementKey: varchar('entitlement_key', { length: 50 })
      .notNull()
      .default('pro_access'),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
    sourceType: varchar('source_type', { length: 30 }).notNull(),
    sourceId: uuid('source_id'),
    reason: text('reason'),
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('billing_entitlement_overrides_user_entitlement_idx').on(
      table.userId,
      table.entitlementKey,
    ),
    index('billing_entitlement_overrides_user_entitlement_range_idx').on(
      table.userId,
      table.entitlementKey,
      table.startsAt,
      table.endsAt,
    ),
    check(
      'billing_entitlement_overrides_window_check',
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const billingEvents = pgTable(
  'billing_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: varchar('provider', { length: 50 }),
    source: varchar('source', { length: 20 }).notNull(), // 'system' | 'admin' | 'provider'
    type: varchar('type', { length: 50 }).notNull(),
    externalEventId: varchar('external_event_id', { length: 255 }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id'),
    payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull().default({}),
    requestId: varchar('request_id', { length: 100 }),
    idempotencyKey: varchar('idempotency_key', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('billing_events_provider_external_event_id_idx').on(
      table.provider,
      table.externalEventId,
    ),
    index('billing_events_user_id_idx').on(table.userId),
  ],
);

export const billingPromotions = pgTable(
  'billing_promotions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    hashVersion: integer('hash_version').notNull(),
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    codePrefix: varchar('code_prefix', { length: 16 }),
    name: varchar('name', { length: 255 }),
    description: text('description'),
    entitlementKey: varchar('entitlement_key', { length: 50 })
      .notNull()
      .default('pro_access'),
    grantDurationDays: integer('grant_duration_days'),
    grantFixedEndsAt: timestamp('grant_fixed_ends_at', { withTimezone: true, mode: 'date' }),
    isActive: boolean('is_active').notNull().default(true),
    validFrom: timestamp('valid_from', { withTimezone: true, mode: 'date' }),
    validTo: timestamp('valid_to', { withTimezone: true, mode: 'date' }),
    maxRedemptions: integer('max_redemptions'),
    perUserMaxRedemptions: integer('per_user_max_redemptions').notNull().default(1),
    redemptionCount: integer('redemption_count').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('billing_promotions_code_hash_idx').on(table.codeHash),
    index('billing_promotions_active_valid_idx').on(table.isActive, table.validFrom, table.validTo),
    check(
      'billing_promotions_grant_exclusive_check',
      sql`(${table.grantDurationDays} is null) <> (${table.grantFixedEndsAt} is null)`,
    ),
  ],
);

export const billingPromotionRedemptions = pgTable(
  'billing_promotion_redemptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    promotionId: uuid('promotion_id')
      .notNull()
      .references(() => billingPromotions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('billing_promotion_redemptions_promotion_user_idx').on(
      table.promotionId,
      table.userId,
    ),
  ],
);

export const billingPendingEntitlementGrants = pgTable(
  'billing_pending_entitlement_grants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    hashVersion: integer('hash_version').notNull(),
    emailHash: varchar('email_hash', { length: 64 }).notNull(),
    entitlementKey: varchar('entitlement_key', { length: 50 })
      .notNull()
      .default('pro_access'),
    grantDurationDays: integer('grant_duration_days'),
    grantFixedEndsAt: timestamp('grant_fixed_ends_at', { withTimezone: true, mode: 'date' }),
    isActive: boolean('is_active').notNull().default(true),
    claimValidFrom: timestamp('claim_valid_from', { withTimezone: true, mode: 'date' }),
    claimValidTo: timestamp('claim_valid_to', { withTimezone: true, mode: 'date' }),
    claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
    claimedByUserId: uuid('claimed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    claimSource: varchar('claim_source', { length: 50 }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('billing_pending_entitlement_grants_email_active_idx').on(
      table.emailHash,
      table.isActive,
      table.claimedAt,
    ),
    check(
      'billing_pending_entitlement_grants_grant_exclusive_check',
      sql`(${table.grantDurationDays} is null) <> (${table.grantFixedEndsAt} is null)`,
    ),
  ],
);

// =============================================================================
// PAYMENTS CORE TABLES (Phase 4 - Story 1.2 foundation)
// =============================================================================

export const moneyTraces = pgTable(
  'money_traces',
  {
    traceId: varchar('trace_id', { length: 128 }).primaryKey(),
    organizerId: uuid('organizer_id'),
    rootEntityType: varchar('root_entity_type', { length: 64 }).notNull(),
    rootEntityId: varchar('root_entity_id', { length: 128 }).notNull(),
    createdBySource: moneyMutationSourceEnum('created_by_source').notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('money_traces_organizer_idx')
      .on(table.organizerId)
      .where(sql`${table.organizerId} is not null`),
    index('money_traces_root_entity_idx').on(table.rootEntityType, table.rootEntityId),
  ],
);

export const moneyEvents = pgTable(
  'money_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    traceId: varchar('trace_id', { length: 128 })
      .notNull()
      .references(() => moneyTraces.traceId, { onDelete: 'cascade' }),
    organizerId: uuid('organizer_id'),
    eventName: varchar('event_name', { length: 120 }).notNull(),
    eventVersion: integer('event_version').notNull(),
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: varchar('entity_id', { length: 128 }).notNull(),
    source: moneyMutationSourceEnum('source').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull().default({}),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('money_events_trace_idx').on(table.traceId, table.occurredAt),
    index('money_events_entity_idx').on(table.entityType, table.entityId),
    index('money_events_organizer_idx')
      .on(table.organizerId)
      .where(sql`${table.organizerId} is not null`),
    uniqueIndex('money_events_trace_idempotency_idx')
      .on(table.traceId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    check('money_events_event_version_positive_chk', sql`${table.eventVersion} > 0`),
  ],
);

export const moneyCommandIngestions = pgTable(
  'money_command_ingestions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizerId: uuid('organizer_id').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    traceId: varchar('trace_id', { length: 128 })
      .notNull()
      .references(() => moneyTraces.traceId, { onDelete: 'cascade' }),
    status: moneyCommandIngestionStatusEnum('status').notNull().default('processing'),
    eventCount: integer('event_count').notNull().default(0),
    responseSummaryJson: jsonb('response_summary_json')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('money_command_ingestions_org_idempotency_idx').on(
      table.organizerId,
      table.idempotencyKey,
    ),
    index('money_command_ingestions_trace_idx').on(table.traceId),
    index('money_command_ingestions_status_idx').on(table.status),
  ],
);

// =============================================================================
// EVENTS PLATFORM TABLES (Phase 0)
// =============================================================================

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    slugIdx: uniqueIndex('organizations_slug_idx').on(table.slug),
  }),
);

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: organizationRoleEnum('role').notNull(), // 'owner' | 'admin' | 'editor' | 'viewer'
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    orgUserUnique: uniqueIndex('org_memberships_org_user_idx').on(table.organizationId, table.userId),
  }),
);

export const eventSeries = pgTable(
  'event_series',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 100 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    sportType: varchar('sport_type', { length: 50 }).notNull(), // from SPORT_TYPES constant
    status: varchar('status', { length: 20 }).notNull().default('active'), // 'active' | 'archived'
    primaryLocale: varchar('primary_locale', { length: 10 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    orgSlugUnique: uniqueIndex('event_series_org_slug_idx').on(table.organizationId, table.slug),
  }),
);

export const eventEditions = pgTable(
  'event_editions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => eventSeries.id, { onDelete: 'cascade' }),
    editionLabel: varchar('edition_label', { length: 50 }).notNull(), // e.g., "2026"
    publicCode: varchar('public_code', { length: 20 }).notNull().unique(), // short stable ID
    slug: varchar('slug', { length: 100 }).notNull(),
    previousEditionId: uuid('previous_edition_id'),
    clonedFromEditionId: uuid('cloned_from_edition_id'),
    visibility: varchar('visibility', { length: 20 }).notNull().default('draft'), // 'draft' | 'published' | 'unlisted' | 'archived'
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
    timezone: varchar('timezone', { length: 50 }).notNull().default('America/Mexico_City'),
    registrationOpensAt: timestamp('registration_opens_at', { withTimezone: true, mode: 'date' }),
    registrationClosesAt: timestamp('registration_closes_at', { withTimezone: true, mode: 'date' }),
    isRegistrationPaused: boolean('is_registration_paused').notNull().default(false),
    sharedCapacity: integer('shared_capacity'),
    primaryLocale: varchar('primary_locale', { length: 10 }),
    locationDisplay: varchar('location_display', { length: 255 }),
    address: varchar('address', { length: 500 }),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    country: varchar('country', { length: 100 }).default('MX'),
    latitude: decimal('latitude', { precision: 10, scale: 7 }),
    longitude: decimal('longitude', { precision: 10, scale: 7 }),
    externalUrl: varchar('external_url', { length: 500 }),
    heroImageMediaId: uuid('hero_image_media_id'),
    description: text('description'), // Event description (rich text or plain)
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      name: 'event_editions_previous_edition_fk',
      columns: [table.previousEditionId],
      foreignColumns: [table.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'event_editions_cloned_from_edition_fk',
      columns: [table.clonedFromEditionId],
      foreignColumns: [table.id],
    }).onDelete('set null'),
    uniqueIndex('event_editions_public_code_idx').on(table.publicCode),
    uniqueIndex('event_editions_series_slug_idx').on(table.seriesId, table.slug),
    index('event_editions_previous_edition_idx').on(table.previousEditionId),
    index('event_editions_cloned_from_edition_idx').on(table.clonedFromEditionId),
  ],
);

export const eventDistances = pgTable('event_distances', {
  id: uuid('id').defaultRandom().primaryKey(),
  editionId: uuid('edition_id')
    .notNull()
    .references(() => eventEditions.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 100 }).notNull(), // e.g., "50K", "Half Marathon"
  distanceValue: decimal('distance_value', { precision: 10, scale: 2 }),
  distanceUnit: varchar('distance_unit', { length: 10 }).notNull().default('km'), // 'km' | 'mi'
  kind: varchar('kind', { length: 20 }).notNull().default('distance'), // 'distance' | 'timed'
  startTimeLocal: timestamp('start_time_local', { withTimezone: true, mode: 'date' }),
  timeLimitMinutes: integer('time_limit_minutes'),
  terrain: varchar('terrain', { length: 20 }), // 'road' | 'trail' | 'mixed'
  isVirtual: boolean('is_virtual').notNull().default(false),
  capacity: integer('capacity'),
  capacityScope: varchar('capacity_scope', { length: 20 }).notNull().default('per_distance'), // 'per_distance' | 'shared_pool'
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

// =============================================================================
// RESULTS DOMAIN TABLES (Phase 3 - Story 1.1 foundation)
// =============================================================================

export const resultVersionStatusEnum = pgEnum('result_version_status', [
  'draft',
  'official',
  'corrected',
]);

export const resultVersionSourceEnum = pgEnum('result_version_source', [
  'manual_offline',
  'csv_excel',
  'correction',
]);

export const resultEntryStatusEnum = pgEnum('result_entry_status', ['finish', 'dq', 'dnf', 'dns']);

export const resultDisciplineEnum = pgEnum('result_discipline', [
  'trail_running',
  'triathlon',
  'cycling',
  'mtb',
  'gravel_bike',
  'duathlon',
  'backyard_ultra',
]);

export const resultEntryClaimStatusEnum = pgEnum('result_entry_claim_status', [
  'pending_review',
  'linked',
  'rejected',
]);

export const resultCorrectionRequestStatusEnum = pgEnum('result_correction_request_status', [
  'pending',
  'approved',
  'rejected',
]);

export const resultIngestionSourceLaneEnum = pgEnum('result_ingestion_source_lane', [
  'manual_offline',
  'csv_excel',
]);

export const rankingRulesetStatusEnum = pgEnum('ranking_ruleset_status', [
  'draft',
  'active',
  'retired',
]);

export const rankingSnapshotScopeEnum = pgEnum('ranking_snapshot_scope', [
  'national',
  'organizer',
]);

export const resultVersions = pgTable(
  'result_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => eventEditions.id, { onDelete: 'cascade' }),
    status: resultVersionStatusEnum('status').notNull().default('draft'),
    source: resultVersionSourceEnum('source').notNull(),
    versionNumber: integer('version_number').notNull(),
    parentVersionId: uuid('parent_version_id'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    finalizedByUserId: uuid('finalized_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    finalizedAt: timestamp('finalized_at', { withTimezone: true, mode: 'date' }),
    sourceFileChecksum: varchar('source_file_checksum', { length: 128 }),
    sourceReference: varchar('source_reference', { length: 255 }),
    provenanceJson: jsonb('provenance_json').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      name: 'result_versions_parent_version_fk',
      columns: [table.parentVersionId],
      foreignColumns: [table.id],
    }).onDelete('set null'),
    uniqueIndex('result_versions_edition_version_idx').on(table.editionId, table.versionNumber),
    index('result_versions_edition_status_idx').on(table.editionId, table.status),
    index('result_versions_parent_version_idx')
      .on(table.parentVersionId)
      .where(sql`${table.parentVersionId} is not null`),
    index('result_versions_created_by_idx')
      .on(table.createdByUserId)
      .where(sql`${table.createdByUserId} is not null`),
  ],
);

export const resultEntries = pgTable(
  'result_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resultVersionId: uuid('result_version_id')
      .notNull()
      .references(() => resultVersions.id, { onDelete: 'cascade' }),
    distanceId: uuid('distance_id').references(() => eventDistances.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // nullable for unclaimed results
    discipline: resultDisciplineEnum('discipline').notNull(),
    runnerFullName: varchar('runner_full_name', { length: 255 }).notNull(),
    bibNumber: varchar('bib_number', { length: 50 }),
    gender: varchar('gender', { length: 20 }),
    age: integer('age'),
    status: resultEntryStatusEnum('status').notNull().default('finish'),
    finishTimeMillis: integer('finish_time_millis'),
    overallPlace: integer('overall_place'),
    genderPlace: integer('gender_place'),
    ageGroupPlace: integer('age_group_place'),
    identitySnapshot: jsonb('identity_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    rawSourceData: jsonb('raw_source_data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('result_entries_version_idx').on(table.resultVersionId),
    index('result_entries_user_idx').on(table.userId).where(sql`${table.userId} is not null`),
    index('result_entries_distance_idx')
      .on(table.distanceId)
      .where(sql`${table.distanceId} is not null`),
    index('result_entries_version_bib_idx')
      .on(table.resultVersionId, table.bibNumber)
      .where(sql`${table.bibNumber} is not null`),
    index('result_entries_version_name_idx').on(table.resultVersionId, table.runnerFullName),
    uniqueIndex('result_entries_version_bib_unique_idx')
      .on(table.resultVersionId, table.bibNumber)
      .where(sql`${table.bibNumber} is not null`),
    uniqueIndex('result_entries_version_name_no_bib_unique_idx')
      .on(table.resultVersionId, table.runnerFullName)
      .where(sql`${table.bibNumber} is null`),
    check('result_entries_age_non_negative_chk', sql`${table.age} is null OR ${table.age} >= 0`),
    check(
      'result_entries_finish_time_positive_chk',
      sql`${table.finishTimeMillis} is null OR ${table.finishTimeMillis} > 0`,
    ),
  ],
);

export const resultEntryClaims = pgTable(
  'result_entry_claims',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resultEntryId: uuid('result_entry_id')
      .notNull()
      .references(() => resultEntries.id, { onDelete: 'cascade' }),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    linkedUserId: uuid('linked_user_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    status: resultEntryClaimStatusEnum('status').notNull().default('pending_review'),
    confidenceBasisPoints: integer('confidence_basis_points'),
    reviewReason: varchar('review_reason', { length: 120 }),
    reviewContext: jsonb('review_context').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('result_entry_claims_entry_unique_idx')
      .on(table.resultEntryId)
      .where(sql`${table.deletedAt} is null`),
    index('result_entry_claims_requested_by_idx').on(table.requestedByUserId),
    index('result_entry_claims_linked_user_idx')
      .on(table.linkedUserId)
      .where(sql`${table.linkedUserId} is not null`),
    index('result_entry_claims_reviewed_by_idx')
      .on(table.reviewedByUserId)
      .where(sql`${table.reviewedByUserId} is not null`),
    index('result_entry_claims_status_idx').on(table.status),
    check(
      'result_entry_claims_confidence_range_chk',
      sql`${table.confidenceBasisPoints} is null OR (${table.confidenceBasisPoints} >= 0 AND ${table.confidenceBasisPoints} <= 1000)`,
    ),
    check(
      'result_entry_claims_linked_user_required_chk',
      sql`${table.status} != 'linked' OR ${table.linkedUserId} is not null`,
    ),
    check(
      'result_entry_claims_pending_review_unlinked_chk',
      sql`${table.status} != 'pending_review' OR ${table.linkedUserId} is null`,
    ),
    check(
      'result_entry_claims_rejected_unlinked_chk',
      sql`${table.status} != 'rejected' OR ${table.linkedUserId} is null`,
    ),
  ],
);

export const resultIngestionSessions = pgTable(
  'result_ingestion_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => eventEditions.id, { onDelete: 'cascade' }),
    resultVersionId: uuid('result_version_id')
      .notNull()
      .references(() => resultVersions.id, { onDelete: 'cascade' }),
    sourceLane: resultIngestionSourceLaneEnum('source_lane').notNull(),
    startedByUserId: uuid('started_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    sourceReference: varchar('source_reference', { length: 255 }),
    sourceFileChecksum: varchar('source_file_checksum', { length: 128 }),
    provenanceJson: jsonb('provenance_json').$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('result_ingestion_sessions_version_unique_idx')
      .on(table.resultVersionId)
      .where(sql`${table.deletedAt} is null`),
    index('result_ingestion_sessions_edition_idx').on(table.editionId),
    index('result_ingestion_sessions_lane_idx').on(table.sourceLane),
    index('result_ingestion_sessions_started_by_idx')
      .on(table.startedByUserId)
      .where(sql`${table.startedByUserId} is not null`),
  ],
);

export const resultCorrectionRequests = pgTable(
  'result_correction_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resultEntryId: uuid('result_entry_id')
      .notNull()
      .references(() => resultEntries.id, { onDelete: 'cascade' }),
    resultVersionId: uuid('result_version_id')
      .notNull()
      .references(() => resultVersions.id, { onDelete: 'cascade' }),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: resultCorrectionRequestStatusEnum('status').notNull().default('pending'),
    reason: varchar('reason', { length: 500 }).notNull(),
    requestContext: jsonb('request_context').$type<Record<string, unknown>>().notNull().default({}),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewDecisionNote: varchar('review_decision_note', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('result_correction_requests_entry_idx').on(table.resultEntryId),
    index('result_correction_requests_version_idx').on(table.resultVersionId),
    index('result_correction_requests_requested_by_idx').on(table.requestedByUserId),
    index('result_correction_requests_status_idx').on(table.status),
    index('result_correction_requests_reviewed_by_idx')
      .on(table.reviewedByUserId)
      .where(sql`${table.reviewedByUserId} is not null`),
  ],
);

export const rankingRulesets = pgTable(
  'ranking_rulesets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    versionTag: varchar('version_tag', { length: 64 }).notNull(),
    status: rankingRulesetStatusEnum('status').notNull().default('draft'),
    rulesDefinitionJson: jsonb('rules_definition_json')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    explainabilityReference: varchar('explainability_reference', { length: 255 }),
    activationStartsAt: timestamp('activation_starts_at', { withTimezone: true, mode: 'date' })
      .notNull(),
    activationEndsAt: timestamp('activation_ends_at', { withTimezone: true, mode: 'date' }),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('ranking_rulesets_version_tag_unique_idx')
      .on(table.versionTag)
      .where(sql`${table.deletedAt} is null`),
    index('ranking_rulesets_status_idx').on(table.status),
    index('ranking_rulesets_activation_window_idx').on(
      table.activationStartsAt,
      table.activationEndsAt,
    ),
    index('ranking_rulesets_published_by_idx')
      .on(table.publishedByUserId)
      .where(sql`${table.publishedByUserId} is not null`),
    check(
      'ranking_rulesets_activation_window_chk',
      sql`${table.activationEndsAt} is null OR ${table.activationEndsAt} > ${table.activationStartsAt}`,
    ),
    check(
      'ranking_rulesets_active_requires_published_at_chk',
      sql`${table.status} != 'active' OR ${table.publishedAt} is not null`,
    ),
  ],
);

export const rankingSnapshots = pgTable(
  'ranking_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rulesetId: uuid('ruleset_id')
      .notNull()
      .references(() => rankingRulesets.id, { onDelete: 'cascade' }),
    scope: rankingSnapshotScopeEnum('scope').notNull().default('national'),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    sourceVersionIdsJson: jsonb('source_version_ids_json')
      .$type<string[]>()
      .notNull()
      .default([]),
    exclusionLogJson: jsonb('exclusion_log_json')
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    triggerResultVersionId: uuid('trigger_result_version_id').references(() => resultVersions.id, {
      onDelete: 'set null',
    }),
    isCurrent: boolean('is_current').notNull().default(false),
    promotedAt: timestamp('promoted_at', { withTimezone: true, mode: 'date' }),
    rowCount: integer('row_count').notNull().default(0),
    generatedAt: timestamp('generated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('ranking_snapshots_ruleset_idx').on(table.rulesetId),
    index('ranking_snapshots_scope_org_idx')
      .on(table.scope, table.organizationId)
      .where(sql`${table.organizationId} is not null`),
    index('ranking_snapshots_generated_at_idx').on(table.generatedAt),
    index('ranking_snapshots_current_idx')
      .on(table.scope, table.organizationId, table.isCurrent)
      .where(sql`${table.isCurrent} = true`),
    index('ranking_snapshots_trigger_version_idx')
      .on(table.triggerResultVersionId)
      .where(sql`${table.triggerResultVersionId} is not null`),
    check(
      'ranking_snapshots_scope_org_consistency_chk',
      sql`(${table.scope} = 'national' AND ${table.organizationId} is null) OR (${table.scope} = 'organizer' AND ${table.organizationId} is not null)`,
    ),
  ],
);

export const rankingSnapshotRows = pgTable(
  'ranking_snapshot_rows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => rankingSnapshots.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
    resultEntryId: uuid('result_entry_id').references(() => resultEntries.id, {
      onDelete: 'set null',
    }),
    resultVersionId: uuid('result_version_id').references(() => resultVersions.id, {
      onDelete: 'set null',
    }),
    runnerFullName: varchar('runner_full_name', { length: 255 }).notNull(),
    bibNumber: varchar('bib_number', { length: 50 }),
    discipline: resultDisciplineEnum('discipline').notNull(),
    gender: varchar('gender', { length: 20 }),
    age: integer('age'),
    finishTimeMillis: integer('finish_time_millis'),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('ranking_snapshot_rows_snapshot_rank_unique_idx')
      .on(table.snapshotId, table.rank)
      .where(sql`${table.deletedAt} is null`),
    index('ranking_snapshot_rows_snapshot_idx').on(table.snapshotId),
    index('ranking_snapshot_rows_result_version_idx')
      .on(table.resultVersionId)
      .where(sql`${table.resultVersionId} is not null`),
    index('ranking_snapshot_rows_result_entry_idx')
      .on(table.resultEntryId)
      .where(sql`${table.resultEntryId} is not null`),
    check('ranking_snapshot_rows_rank_positive_chk', sql`${table.rank} > 0`),
  ],
);

export const pricingTiers = pgTable('pricing_tiers', {
  id: uuid('id').defaultRandom().primaryKey(),
  distanceId: uuid('distance_id')
    .notNull()
    .references(() => eventDistances.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 100 }),
  startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
  endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
  priceCents: integer('price_cents').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('MXN'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => eventEditions.id, { onDelete: 'cascade' }),
    distanceId: uuid('distance_id')
      .notNull()
      .references(() => eventDistances.id, { onDelete: 'cascade' }),
    buyerUserId: uuid('buyer_user_id')
      .references(() => users.id, { onDelete: 'cascade' }),
    paymentResponsibility: paymentResponsibilityEnum('payment_responsibility')
      .notNull()
      .default('self_pay'),
    status: varchar('status', { length: 20 }).notNull().default('started'), // 'started' | 'submitted' | 'payment_pending' | 'confirmed' | 'cancelled'
    basePriceCents: integer('base_price_cents'),
    feesCents: integer('fees_cents'),
    taxCents: integer('tax_cents'),
    totalCents: integer('total_cents'),
    registrationGroupId: uuid('registration_group_id').references(() => registrationGroups.id, {
      onDelete: 'set null',
    }),
    groupDiscountPercentOff: integer('group_discount_percent_off'),
    groupDiscountAmountCents: integer('group_discount_amount_cents'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    statusExpiresAtIdx: index('registrations_status_expires_at_idx')
      .on(table.status, table.expiresAt)
      .where(sql`${table.deletedAt} is null and ${table.expiresAt} is not null`),
    registrationGroupIdIdx: index('registrations_registration_group_id_idx')
      .on(table.registrationGroupId)
      .where(sql`${table.registrationGroupId} is not null`),
  }),
);

export const registrants = pgTable('registrants', {
  id: uuid('id').defaultRandom().primaryKey(),
  registrationId: uuid('registration_id')
    .notNull()
    .references(() => registrations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // nullable for guest/batch registrations
  profileSnapshot: jsonb('profile_snapshot').$type<{
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
  }>(),
  division: varchar('division', { length: 20 }), // results division
  genderIdentity: varchar('gender_identity', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

export const waivers = pgTable('waivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  editionId: uuid('edition_id')
    .notNull()
    .references(() => eventEditions.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  versionHash: varchar('version_hash', { length: 64 }).notNull(), // SHA-256 of body for tracking changes
  signatureType: varchar('signature_type', { length: 20 }).notNull().default('checkbox'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

export const waiverAcceptances = pgTable('waiver_acceptances', {
  id: uuid('id').defaultRandom().primaryKey(),
  registrationId: uuid('registration_id')
    .notNull()
    .references(() => registrations.id, { onDelete: 'cascade' }),
  waiverId: uuid('waiver_id')
    .notNull()
    .references(() => waivers.id, { onDelete: 'cascade' }),
  waiverVersionHash: varchar('waiver_version_hash', { length: 64 }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }), // IPv6 compatible
  userAgent: text('user_agent'),
  signatureType: varchar('signature_type', { length: 20 }).notNull(), // 'checkbox' | 'initials' | 'signature'
  signatureValue: text('signature_value'), // For initials/signature, stores the value
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => ({
  registrationWaiverUnique: uniqueIndex('waiver_acceptances_registration_waiver_idx').on(
    table.registrationId,
    table.waiverId,
  ),
}));

export const eventWebsiteContent = pgTable('event_website_content', {
  id: uuid('id').defaultRandom().primaryKey(),
  editionId: uuid('edition_id')
    .notNull()
    .references(() => eventEditions.id, { onDelete: 'cascade' }),
  locale: varchar('locale', { length: 10 }).notNull().default('es'),
  blocksJson: jsonb('blocks_json').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

export const eventFaqItems = pgTable('event_faq_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  editionId: uuid('edition_id')
    .notNull()
    .references(() => eventEditions.id, { onDelete: 'cascade' }),
  question: varchar('question', { length: 500 }).notNull(),
  answer: text('answer').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

export const eventPolicyConfigs = pgTable('event_policy_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  editionId: uuid('edition_id')
    .notNull()
    .references(() => eventEditions.id, { onDelete: 'cascade' })
    .unique(),
  refundsAllowed: boolean('refunds_allowed').notNull().default(false),
  refundPolicyText: text('refund_policy_text'),
  refundDeadline: timestamp('refund_deadline', { withTimezone: true, mode: 'date' }),
  transfersAllowed: boolean('transfers_allowed').notNull().default(false),
  transferPolicyText: text('transfer_policy_text'),
  transferDeadline: timestamp('transfer_deadline', { withTimezone: true, mode: 'date' }),
  deferralsAllowed: boolean('deferrals_allowed').notNull().default(false),
  deferralPolicyText: text('deferral_policy_text'),
  deferralDeadline: timestamp('deferral_deadline', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// =============================================================================
// REFUND WORKFLOW TABLES (Phase 4 - Story 3.1 foundation)
// =============================================================================

export const refundRequests = pgTable(
  'refund_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => eventEditions.id, { onDelete: 'cascade' }),
    organizerId: uuid('organizer_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    attendeeUserId: uuid('attendee_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: refundRequestStatusEnum('status').notNull().default('pending_organizer_decision'),
    reasonCode: varchar('reason_code', { length: 64 }).notNull(),
    reasonNote: text('reason_note'),
    eligibilitySnapshotJson: jsonb('eligibility_snapshot_json')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    financialSnapshotJson: jsonb('financial_snapshot_json')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    decisionAt: timestamp('decision_at', { withTimezone: true, mode: 'date' }),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    decisionReason: text('decision_reason'),
    escalatedAt: timestamp('escalated_at', { withTimezone: true, mode: 'date' }),
    executedAt: timestamp('executed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('refund_requests_organizer_status_idx').on(table.organizerId, table.status, table.requestedAt),
    index('refund_requests_attendee_idx').on(table.attendeeUserId, table.requestedAt),
    index('refund_requests_registration_idx').on(table.registrationId),
    index('refund_requests_edition_idx').on(table.editionId, table.requestedAt),
    uniqueIndex('refund_requests_registration_pending_unique_idx')
      .on(table.registrationId)
      .where(
        sql`${table.status} = 'pending_organizer_decision' and ${table.deletedAt} is null`,
      ),
  ],
);

// =============================================================================
// DISPUTE WORKFLOW TABLES (Phase 4 - Story 4.1 foundation)
// =============================================================================

export const disputeCases = pgTable(
  'dispute_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizerId: uuid('organizer_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    registrationId: uuid('registration_id').references(() => registrations.id, {
      onDelete: 'set null',
    }),
    orderId: uuid('order_id'),
    attendeeUserId: uuid('attendee_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    openedByUserId: uuid('opened_by_user_id')
      .notNull()
      .references(() => users.id),
    status: disputeCaseStatusEnum('status').notNull().default('opened'),
    reasonCode: varchar('reason_code', { length: 64 }).notNull(),
    reasonNote: text('reason_note'),
    amountAtRiskMinor: integer('amount_at_risk_minor').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('MXN'),
    evidenceDeadlineAt: timestamp('evidence_deadline_at', { withTimezone: true, mode: 'date' })
      .notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    lastTransitionAt: timestamp('last_transition_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    latestTransitionByUserId: uuid('latest_transition_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('dispute_cases_organizer_status_idx').on(table.organizerId, table.status, table.openedAt),
    index('dispute_cases_registration_idx').on(table.registrationId, table.openedAt),
    index('dispute_cases_order_idx')
      .on(table.orderId, table.openedAt)
      .where(sql`${table.orderId} is not null`),
    index('dispute_cases_attendee_idx')
      .on(table.attendeeUserId, table.openedAt)
      .where(sql`${table.attendeeUserId} is not null`),
    check('dispute_cases_amount_at_risk_nonnegative_chk', sql`${table.amountAtRiskMinor} >= 0`),
    check(
      'dispute_cases_scope_required_chk',
      sql`${table.registrationId} is not null or ${table.orderId} is not null`,
    ),
  ],
);

// =============================================================================
// EVENTS PLATFORM TABLES (Phase 3)
// =============================================================================

export const eventSlugRedirects = pgTable(
  'event_slug_redirects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fromSeriesSlug: varchar('from_series_slug', { length: 100 }).notNull(),
    fromEditionSlug: varchar('from_edition_slug', { length: 100 }).notNull(),
    toSeriesSlug: varchar('to_series_slug', { length: 100 }).notNull(),
    toEditionSlug: varchar('to_edition_slug', { length: 100 }).notNull(),
    reason: varchar('reason', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    fromUnique: uniqueIndex('event_slug_redirects_from_unique_idx').on(
      table.fromSeriesSlug,
      table.fromEditionSlug,
    ),
    toIdx: index('event_slug_redirects_to_idx').on(table.toSeriesSlug, table.toEditionSlug),
  }),
);

export const groupUploadLinks = pgTable(
  'group_upload_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => eventEditions.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: varchar('token_prefix', { length: 12 }).notNull(),
    name: varchar('name', { length: 255 }),
    paymentResponsibility: paymentResponsibilityEnum('payment_responsibility')
      .notNull()
      .default('self_pay'),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
    isActive: boolean('is_active').notNull().default(true),
    maxBatches: integer('max_batches'),
    maxInvites: integer('max_invites'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revokedByUserId: uuid('revoked_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('group_upload_links_token_hash_idx').on(table.tokenHash),
    index('group_upload_links_edition_created_at_idx').on(table.editionId, table.createdAt),
    check(
      'group_upload_links_starts_ends_check',
      sql`${table.startsAt} is null or ${table.endsAt} is null or ${table.startsAt} <= ${table.endsAt}`,
    ),
  ],
);

export const groupRegistrationBatchStatusEnum = pgEnum('group_registration_batch_status', [
  'uploaded',
  'validated',
  'processed',
  'failed',
]);

export const groupRegistrationBatches = pgTable(
  'group_registration_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => eventEditions.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    uploadLinkId: uuid('upload_link_id').references(() => groupUploadLinks.id, {
      onDelete: 'set null',
    }),
    paymentResponsibility: paymentResponsibilityEnum('payment_responsibility')
      .notNull()
      .default('self_pay'),
    distanceId: uuid('distance_id').references(() => eventDistances.id, {
      onDelete: 'set null',
    }),
    status: groupRegistrationBatchStatusEnum('status').notNull().default('uploaded'),
    sourceFileMediaId: uuid('source_file_media_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    editionCreatedAtIdx: index('group_registration_batches_edition_created_at_idx').on(
      table.editionId,
      table.createdAt,
    ),
    uploadLinkCreatedAtIdx: index('group_registration_batches_upload_link_created_at_idx').on(
      table.uploadLinkId,
      table.createdAt,
    ),
    distanceCreatedAtIdx: index('group_registration_batches_distance_created_at_idx').on(
      table.distanceId,
      table.createdAt,
    ),
    statusIdx: index('group_registration_batches_status_idx').on(table.status),
    uploadLinkDistanceCheck: check(
      'group_registration_batches_upload_link_distance_check',
      sql`${table.uploadLinkId} is null or ${table.distanceId} is not null`,
    ),
  }),
);

export const groupRegistrationBatchRows = pgTable(
  'group_registration_batch_rows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => groupRegistrationBatches.id, { onDelete: 'cascade' }),
    rowIndex: integer('row_index').notNull(),
    rawJson: jsonb('raw_json').$type<Record<string, unknown>>().notNull().default({}),
    validationErrorsJson: jsonb('validation_errors_json')
      .$type<string[]>()
      .notNull()
      .default([]),
    createdRegistrationId: uuid('created_registration_id').references(() => registrations.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    batchRowIndexUnique: uniqueIndex('group_registration_batch_rows_batch_row_idx').on(
      table.batchId,
      table.rowIndex,
    ),
    createdRegistrationIdx: index('group_registration_batch_rows_created_registration_idx').on(
      table.createdRegistrationId,
    ),
  }),
);

export const registrationInviteStatusEnum = pgEnum('registration_invite_status', [
  'draft',
  'sent',
  'claimed',
  'cancelled',
  'expired',
  'superseded',
]);

export const registrationInvites = pgTable(
  'registration_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => eventEditions.id, { onDelete: 'cascade' }),
    uploadLinkId: uuid('upload_link_id')
      .notNull()
      .references(() => groupUploadLinks.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => groupRegistrationBatches.id, { onDelete: 'cascade' }),
    batchRowId: uuid('batch_row_id')
      .notNull()
      .references(() => groupRegistrationBatchRows.id, { onDelete: 'cascade' }),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    supersedesInviteId: uuid('supersedes_invite_id').references((): AnyPgColumn => registrationInvites.id, {
      onDelete: 'set null',
    }),
    isCurrent: boolean('is_current').notNull().default(true),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    email: varchar('email', { length: 255 }).notNull(),
    emailNormalized: varchar('email_normalized', { length: 255 }).notNull(),
    dateOfBirth: date('date_of_birth', { mode: 'date' }).notNull(),
    inviteLocale: varchar('invite_locale', { length: 10 }).notNull(),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: varchar('token_prefix', { length: 12 }).notNull(),
    status: registrationInviteStatusEnum('status').notNull().default('draft'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    sendCount: integer('send_count').notNull().default(0),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true, mode: 'date' }),
    claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
    claimedByUserId: uuid('claimed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('registration_invites_token_hash_idx').on(table.tokenHash),
    batchRowCurrentUnique: uniqueIndex('registration_invites_batch_row_current_idx')
      .on(table.batchRowId)
      .where(sql`${table.isCurrent} = true`),
    registrationCurrentUnique: uniqueIndex('registration_invites_registration_current_idx')
      .on(table.registrationId)
      .where(sql`${table.isCurrent} = true`),
    editionEmailCurrentUnique: uniqueIndex('registration_invites_edition_email_current_idx')
      .on(table.editionId, table.emailNormalized)
      .where(
        sql`${table.isCurrent} = true and ${table.status} in ('draft', 'sent')`,
      ),
  }),
);

export const registrationGroups = pgTable(
  'registration_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => eventEditions.id, { onDelete: 'cascade' }),
    distanceId: uuid('distance_id')
      .notNull()
      .references(() => eventDistances.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: varchar('token_prefix', { length: 12 }).notNull(),
    maxMembers: integer('max_members').notNull().default(10),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('registration_groups_token_hash_idx').on(table.tokenHash),
    index('registration_groups_edition_created_at_idx').on(table.editionId, table.createdAt),
    index('registration_groups_created_by_user_created_at_idx').on(table.createdByUserId, table.createdAt),
    check('registration_groups_max_members_check', sql`${table.maxMembers} > 0`),
  ],
);

export const registrationGroupMembers = pgTable(
  'registration_group_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => registrationGroups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    leftAt: timestamp('left_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    groupUserActiveUnique: uniqueIndex('registration_group_members_group_user_active_idx')
      .on(table.groupId, table.userId)
      .where(sql`${table.leftAt} is null`),
    groupJoinedAtIdx: index('registration_group_members_group_joined_at_idx').on(table.groupId, table.joinedAt),
  }),
);

export const groupDiscountRules = pgTable(
  'group_discount_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => eventEditions.id, { onDelete: 'cascade' }),
    minParticipants: integer('min_participants').notNull(),
    percentOff: integer('percent_off').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    editionThresholdUnique: uniqueIndex('group_discount_rules_edition_threshold_idx').on(
      table.editionId,
      table.minParticipants,
    ),
    isActiveIdx: index('group_discount_rules_is_active_idx').on(table.isActive),
  }),
);

export const media = pgTable('media', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  blobUrl: text('blob_url').notNull(),
  altText: varchar('alt_text', { length: 255 }),
  kind: varchar('kind', { length: 20 }).notNull(), // 'image' | 'pdf' | 'document'
  mimeType: varchar('mime_type', { length: 100 }),
  sizeBytes: integer('size_bytes'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'restrict' }), // required for org-scoped event audits
  actorUserId: uuid('actor_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }), // preserve audit trail even if user is deleted
  action: varchar('action', { length: 100 }).notNull(), // e.g., 'event.create', 'event.update'
  entityType: varchar('entity_type', { length: 50 }).notNull(), // e.g., 'event_edition', 'event_distance'
  entityId: uuid('entity_id').notNull(),
  beforeJson: jsonb('before_json').$type<Record<string, unknown>>(),
  afterJson: jsonb('after_json').$type<Record<string, unknown>>(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const proFeatureConfigs = pgTable(
  'pro_feature_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    featureKey: varchar('feature_key', { length: 100 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    visibilityOverride: varchar('visibility_override', { length: 20 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('pro_feature_configs_feature_key_idx').on(table.featureKey),
    check(
      'pro_feature_configs_visibility_override_chk',
      sql`${table.visibilityOverride} IS NULL OR ${table.visibilityOverride} IN ('locked', 'hidden')`,
    ),
  ],
);

export const proFeatureUsageEvents = pgTable(
  'pro_feature_usage_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    featureKey: varchar('feature_key', { length: 100 }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    eventType: varchar('event_type', { length: 20 }).notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('pro_feature_usage_events_created_at_idx').on(table.createdAt),
    index('pro_feature_usage_events_feature_type_created_at_idx').on(
      table.featureKey,
      table.eventType,
      table.createdAt,
    ),
    check(
      'pro_feature_usage_events_event_type_chk',
      sql`${table.eventType} IN ('used', 'blocked')`,
    ),
  ],
);

// =============================================================================
// EVENTS PLATFORM TABLES (Phase 2)
// =============================================================================

// Add-on type enum: 'merch' for merchandise, 'donation' for optional donations
export const addOnTypeEnum = pgEnum('add_on_type', ['merch', 'donation']);

// Add-on delivery method enum
export const addOnDeliveryMethodEnum = pgEnum('add_on_delivery_method', ['pickup', 'shipping', 'none']);

// Registration question type enum
export const registrationQuestionTypeEnum = pgEnum('registration_question_type', [
  'text',
  'single_select',
  'checkbox',
]);

export const addOns = pgTable('add_ons', {
  id: uuid('id').defaultRandom().primaryKey(),
  editionId: uuid('edition_id')
    .notNull()
    .references(() => eventEditions.id, { onDelete: 'cascade' }),
  distanceId: uuid('distance_id').references(() => eventDistances.id, { onDelete: 'cascade' }), // nullable for edition-wide add-ons
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  type: addOnTypeEnum('type').notNull().default('merch'),
  deliveryMethod: addOnDeliveryMethodEnum('delivery_method').notNull().default('pickup'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

export const addOnOptions = pgTable('add_on_options', {
  id: uuid('id').defaultRandom().primaryKey(),
  addOnId: uuid('add_on_id')
    .notNull()
    .references(() => addOns.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 100 }).notNull(), // e.g., "Small", "Medium", "Large"
  priceCents: integer('price_cents').notNull().default(0), // can be 0 for included, or positive for extra cost
  maxQtyPerOrder: integer('max_qty_per_order').notNull().default(5),
  optionMeta: jsonb('option_meta').$type<{
    size?: string;
    color?: string;
    [key: string]: unknown;
  }>(), // structured metadata for variants
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

export const addOnSelections = pgTable(
  'add_on_selections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => addOnOptions.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(1),
    lineTotalCents: integer('line_total_cents').notNull(), // priceCents * quantity
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    registrationOptionUnique: uniqueIndex('add_on_selections_registration_option_idx').on(
      table.registrationId,
      table.optionId,
    ),
  }),
);

export const discountCodes = pgTable(
  'discount_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => eventEditions.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(), // e.g., "EARLYBIRD20"
    name: varchar('name', { length: 255 }), // internal name for identification
    percentOff: integer('percent_off').notNull(), // 0-100
    maxRedemptions: integer('max_redemptions'), // null = unlimited
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    editionCodeUnique: uniqueIndex('discount_codes_edition_code_active_idx')
      .on(table.editionId, table.code)
      .where(sql`${table.deletedAt} is null`),
  }),
);

export const discountRedemptions = pgTable(
  'discount_redemptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    discountCodeId: uuid('discount_code_id')
      .notNull()
      .references(() => discountCodes.id, { onDelete: 'cascade' }),
    discountAmountCents: integer('discount_amount_cents').notNull(), // calculated discount amount
    redeemedAt: timestamp('redeemed_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    registrationUnique: uniqueIndex('discount_redemptions_registration_unique_idx').on(table.registrationId),
    discountCodeIdIdx: index('discount_redemptions_discount_code_id_idx').on(table.discountCodeId),
  }),
);

export const registrationQuestions = pgTable('registration_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  editionId: uuid('edition_id')
    .notNull()
    .references(() => eventEditions.id, { onDelete: 'cascade' }),
  distanceId: uuid('distance_id').references(() => eventDistances.id, { onDelete: 'cascade' }), // nullable for edition-wide questions
  type: registrationQuestionTypeEnum('type').notNull(),
  prompt: varchar('prompt', { length: 500 }).notNull(),
  helpText: varchar('help_text', { length: 500 }),
  isRequired: boolean('is_required').notNull().default(false),
  options: jsonb('options').$type<string[]>(), // for single_select type
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

export const registrationAnswers = pgTable(
  'registration_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => registrationQuestions.id, { onDelete: 'cascade' }),
    value: text('value'), // stores the answer; for checkbox, stores 'true' or 'false'
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    registrationQuestionUnique: uniqueIndex('registration_answers_registration_question_idx').on(
      table.registrationId,
      table.questionId,
    ),
  }),
);

export const organizationPayoutProfiles = pgTable('organization_payout_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' })
    .unique(), // one profile per organization
  legalName: varchar('legal_name', { length: 255 }),
  rfc: varchar('rfc', { length: 13 }), // Mexican RFC (tax ID)
  payoutDestinationJson: jsonb('payout_destination_json').$type<{
    bankName?: string;
    clabe?: string; // 18-digit Mexican bank account
    accountHolder?: string;
    [key: string]: unknown;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});
