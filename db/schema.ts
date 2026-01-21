import {
  boolean,
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
    visibility: varchar('visibility', { length: 20 }).notNull().default('draft'), // 'draft' | 'published' | 'unlisted' | 'archived'
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
    timezone: varchar('timezone', { length: 50 }).notNull().default('America/Mexico_City'),
    registrationOpensAt: timestamp('registration_opens_at', { withTimezone: true, mode: 'date' }),
    registrationClosesAt: timestamp('registration_closes_at', { withTimezone: true, mode: 'date' }),
    isRegistrationPaused: boolean('is_registration_paused').notNull().default(false),
    sharedCapacity: integer('shared_capacity'),
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
  (table) => ({
    publicCodeIdx: uniqueIndex('event_editions_public_code_idx').on(table.publicCode),
    seriesSlugUnique: uniqueIndex('event_editions_series_slug_idx').on(table.seriesId, table.slug),
  }),
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
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default('started'), // 'started' | 'submitted' | 'payment_pending' | 'confirmed' | 'cancelled'
    basePriceCents: integer('base_price_cents'),
    feesCents: integer('fees_cents'),
    taxCents: integer('tax_cents'),
    totalCents: integer('total_cents'),
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
    .notNull()
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
