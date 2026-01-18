import { relations } from 'drizzle-orm';

import {
  accounts,
  addOnOptions,
  addOnSelections,
  addOns,
  auditLogs,
  contactSubmissions,
  discountCodes,
  discountRedemptions,
  eventDistances,
  eventEditions,
  eventFaqItems,
  eventPolicyConfigs,
  eventSeries,
  eventWebsiteContent,
  media,
  organizationMemberships,
  organizationPayoutProfiles,
  organizations,
  pricingTiers,
  profiles,
  rateLimits,
  registrants,
  registrationAnswers,
  registrationQuestions,
  registrations,
  roles,
  sessions,
  userRoles,
  users,
  waiverAcceptances,
  waivers,
} from './schema';

export const usersRelations = relations(users, ({ many, one }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
  userRoles: many(userRoles),
  contactSubmissions: many(contactSubmissions),
  organizationMemberships: many(organizationMemberships),
  registrations: many(registrations),
  registrants: many(registrants),
  auditLogs: many(auditLogs),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

export const contactSubmissionsRelations = relations(contactSubmissions, ({ one }) => ({
  user: one(users, {
    fields: [contactSubmissions.userId],
    references: [users.id],
  }),
}));

export const rateLimitsRelations = relations(rateLimits, ({ one }) => ({
  user: one(users, {
    fields: [rateLimits.identifier],
    references: [users.id],
  }),
}));

// =============================================================================
// EVENTS PLATFORM RELATIONS (Phase 0)
// =============================================================================

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  memberships: many(organizationMemberships),
  eventSeries: many(eventSeries),
  media: many(media),
  auditLogs: many(auditLogs),
  payoutProfile: one(organizationPayoutProfiles, {
    fields: [organizations.id],
    references: [organizationPayoutProfiles.organizationId],
  }),
}));

export const organizationMembershipsRelations = relations(organizationMemberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMemberships.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMemberships.userId],
    references: [users.id],
  }),
}));

export const eventSeriesRelations = relations(eventSeries, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [eventSeries.organizationId],
    references: [organizations.id],
  }),
  editions: many(eventEditions),
}));

export const eventEditionsRelations = relations(eventEditions, ({ one, many }) => ({
  series: one(eventSeries, {
    fields: [eventEditions.seriesId],
    references: [eventSeries.id],
  }),
  heroImage: one(media, {
    fields: [eventEditions.heroImageMediaId],
    references: [media.id],
  }),
  policyConfig: one(eventPolicyConfigs, {
    fields: [eventEditions.id],
    references: [eventPolicyConfigs.editionId],
  }),
  distances: many(eventDistances),
  registrations: many(registrations),
  waivers: many(waivers),
  websiteContent: many(eventWebsiteContent),
  faqItems: many(eventFaqItems),
  // Phase 2 relations
  addOns: many(addOns),
  discountCodes: many(discountCodes),
  registrationQuestions: many(registrationQuestions),
}));

export const eventDistancesRelations = relations(eventDistances, ({ one, many }) => ({
  edition: one(eventEditions, {
    fields: [eventDistances.editionId],
    references: [eventEditions.id],
  }),
  pricingTiers: many(pricingTiers),
  registrations: many(registrations),
  // Phase 2 relations (distance-scoped)
  addOns: many(addOns),
  registrationQuestions: many(registrationQuestions),
}));

export const pricingTiersRelations = relations(pricingTiers, ({ one }) => ({
  distance: one(eventDistances, {
    fields: [pricingTiers.distanceId],
    references: [eventDistances.id],
  }),
}));

export const registrationsRelations = relations(registrations, ({ one, many }) => ({
  edition: one(eventEditions, {
    fields: [registrations.editionId],
    references: [eventEditions.id],
  }),
  distance: one(eventDistances, {
    fields: [registrations.distanceId],
    references: [eventDistances.id],
  }),
  buyer: one(users, {
    fields: [registrations.buyerUserId],
    references: [users.id],
  }),
  registrants: many(registrants),
  waiverAcceptances: many(waiverAcceptances),
  // Phase 2 relations
  addOnSelections: many(addOnSelections),
  discountRedemptions: many(discountRedemptions),
  registrationAnswers: many(registrationAnswers),
}));

export const registrantsRelations = relations(registrants, ({ one }) => ({
  registration: one(registrations, {
    fields: [registrants.registrationId],
    references: [registrations.id],
  }),
  user: one(users, {
    fields: [registrants.userId],
    references: [users.id],
  }),
}));

export const waiversRelations = relations(waivers, ({ one, many }) => ({
  edition: one(eventEditions, {
    fields: [waivers.editionId],
    references: [eventEditions.id],
  }),
  acceptances: many(waiverAcceptances),
}));

export const waiverAcceptancesRelations = relations(waiverAcceptances, ({ one }) => ({
  registration: one(registrations, {
    fields: [waiverAcceptances.registrationId],
    references: [registrations.id],
  }),
  waiver: one(waivers, {
    fields: [waiverAcceptances.waiverId],
    references: [waivers.id],
  }),
}));

export const eventWebsiteContentRelations = relations(eventWebsiteContent, ({ one }) => ({
  edition: one(eventEditions, {
    fields: [eventWebsiteContent.editionId],
    references: [eventEditions.id],
  }),
}));

export const eventFaqItemsRelations = relations(eventFaqItems, ({ one }) => ({
  edition: one(eventEditions, {
    fields: [eventFaqItems.editionId],
    references: [eventEditions.id],
  }),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  organization: one(organizations, {
    fields: [media.organizationId],
    references: [organizations.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  actor: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));

// =============================================================================
// EVENTS PLATFORM RELATIONS (Phase 2)
// =============================================================================

export const addOnsRelations = relations(addOns, ({ one, many }) => ({
  edition: one(eventEditions, {
    fields: [addOns.editionId],
    references: [eventEditions.id],
  }),
  distance: one(eventDistances, {
    fields: [addOns.distanceId],
    references: [eventDistances.id],
  }),
  options: many(addOnOptions),
}));

export const addOnOptionsRelations = relations(addOnOptions, ({ one, many }) => ({
  addOn: one(addOns, {
    fields: [addOnOptions.addOnId],
    references: [addOns.id],
  }),
  selections: many(addOnSelections),
}));

export const addOnSelectionsRelations = relations(addOnSelections, ({ one }) => ({
  registration: one(registrations, {
    fields: [addOnSelections.registrationId],
    references: [registrations.id],
  }),
  option: one(addOnOptions, {
    fields: [addOnSelections.optionId],
    references: [addOnOptions.id],
  }),
}));

export const discountCodesRelations = relations(discountCodes, ({ one, many }) => ({
  edition: one(eventEditions, {
    fields: [discountCodes.editionId],
    references: [eventEditions.id],
  }),
  redemptions: many(discountRedemptions),
}));

export const discountRedemptionsRelations = relations(discountRedemptions, ({ one }) => ({
  registration: one(registrations, {
    fields: [discountRedemptions.registrationId],
    references: [registrations.id],
  }),
  discountCode: one(discountCodes, {
    fields: [discountRedemptions.discountCodeId],
    references: [discountCodes.id],
  }),
}));

export const registrationQuestionsRelations = relations(registrationQuestions, ({ one, many }) => ({
  edition: one(eventEditions, {
    fields: [registrationQuestions.editionId],
    references: [eventEditions.id],
  }),
  distance: one(eventDistances, {
    fields: [registrationQuestions.distanceId],
    references: [eventDistances.id],
  }),
  answers: many(registrationAnswers),
}));

export const registrationAnswersRelations = relations(registrationAnswers, ({ one }) => ({
  registration: one(registrations, {
    fields: [registrationAnswers.registrationId],
    references: [registrations.id],
  }),
  question: one(registrationQuestions, {
    fields: [registrationAnswers.questionId],
    references: [registrationQuestions.id],
  }),
}));

export const organizationPayoutProfilesRelations = relations(organizationPayoutProfiles, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationPayoutProfiles.organizationId],
    references: [organizations.id],
  }),
}));
