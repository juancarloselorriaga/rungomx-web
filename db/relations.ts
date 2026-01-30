import { relations } from 'drizzle-orm';

import {
  accounts,
  addOnOptions,
  addOnSelections,
  addOns,
  auditLogs,
  billingEntitlementOverrides,
  billingEvents,
  billingPendingEntitlementGrants,
  billingPromotionRedemptions,
  billingPromotions,
  billingSubscriptions,
  billingTrialUses,
  contactSubmissions,
  discountCodes,
  discountRedemptions,
  eventDistances,
  eventEditions,
  eventFaqItems,
  eventPolicyConfigs,
  eventSeries,
  eventSlugRedirects,
  eventWebsiteContent,
  groupDiscountRules,
  groupRegistrationBatchRows,
  groupRegistrationBatches,
  groupUploadLinks,
  media,
  organizationMemberships,
  organizationPayoutProfiles,
  organizations,
  pricingTiers,
  profiles,
  rateLimits,
  registrants,
  registrationAnswers,
  registrationInvites,
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
  billingSubscription: one(billingSubscriptions, {
    fields: [users.id],
    references: [billingSubscriptions.userId],
  }),
  billingTrialUse: one(billingTrialUses, {
    fields: [users.id],
    references: [billingTrialUses.userId],
  }),
  billingEntitlementOverrides: many(billingEntitlementOverrides),
  billingOverridesGranted: many(billingEntitlementOverrides, {
    relationName: 'billingOverridesGrantedBy',
  }),
  billingEvents: many(billingEvents),
  billingPromotionRedemptions: many(billingPromotionRedemptions),
  billingPromotionsCreated: many(billingPromotions, {
    relationName: 'billingPromotionsCreatedBy',
  }),
  billingPendingGrantsCreated: many(billingPendingEntitlementGrants, {
    relationName: 'billingPendingGrantsCreatedBy',
  }),
  billingPendingGrantsClaimed: many(billingPendingEntitlementGrants, {
    relationName: 'billingPendingGrantsClaimedBy',
  }),
  organizationMemberships: many(organizationMemberships),
  registrations: many(registrations),
  registrants: many(registrants),
  groupRegistrationBatches: many(groupRegistrationBatches),
  groupUploadLinksCreated: many(groupUploadLinks, { relationName: 'groupUploadLinksCreatedBy' }),
  groupUploadLinksRevoked: many(groupUploadLinks, { relationName: 'groupUploadLinksRevokedBy' }),
  registrationInvitesCreated: many(registrationInvites, {
    relationName: 'registrationInvitesCreatedBy',
  }),
  registrationInvitesClaimed: many(registrationInvites, {
    relationName: 'registrationInvitesClaimedBy',
  }),
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
// BILLING RELATIONS
// =============================================================================

export const billingSubscriptionsRelations = relations(billingSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [billingSubscriptions.userId],
    references: [users.id],
  }),
}));

export const billingTrialUsesRelations = relations(billingTrialUses, ({ one }) => ({
  user: one(users, {
    fields: [billingTrialUses.userId],
    references: [users.id],
  }),
}));

export const billingEntitlementOverridesRelations = relations(
  billingEntitlementOverrides,
  ({ one }) => ({
    user: one(users, {
      fields: [billingEntitlementOverrides.userId],
      references: [users.id],
    }),
    grantedBy: one(users, {
      fields: [billingEntitlementOverrides.grantedByUserId],
      references: [users.id],
      relationName: 'billingOverridesGrantedBy',
    }),
  }),
);

export const billingEventsRelations = relations(billingEvents, ({ one }) => ({
  user: one(users, {
    fields: [billingEvents.userId],
    references: [users.id],
  }),
}));

export const billingPromotionsRelations = relations(billingPromotions, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [billingPromotions.createdByUserId],
    references: [users.id],
    relationName: 'billingPromotionsCreatedBy',
  }),
  redemptions: many(billingPromotionRedemptions),
}));

export const billingPromotionRedemptionsRelations = relations(
  billingPromotionRedemptions,
  ({ one }) => ({
    promotion: one(billingPromotions, {
      fields: [billingPromotionRedemptions.promotionId],
      references: [billingPromotions.id],
    }),
    user: one(users, {
      fields: [billingPromotionRedemptions.userId],
      references: [users.id],
    }),
  }),
);

export const billingPendingEntitlementGrantsRelations = relations(
  billingPendingEntitlementGrants,
  ({ one }) => ({
    createdBy: one(users, {
      fields: [billingPendingEntitlementGrants.createdByUserId],
      references: [users.id],
      relationName: 'billingPendingGrantsCreatedBy',
    }),
    claimedBy: one(users, {
      fields: [billingPendingEntitlementGrants.claimedByUserId],
      references: [users.id],
      relationName: 'billingPendingGrantsClaimedBy',
    }),
  }),
);

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
  previousEdition: one(eventEditions, {
    fields: [eventEditions.previousEditionId],
    references: [eventEditions.id],
    relationName: 'previousEdition',
  }),
  nextEditions: many(eventEditions, {
    relationName: 'previousEdition',
  }),
  clonedFromEdition: one(eventEditions, {
    fields: [eventEditions.clonedFromEditionId],
    references: [eventEditions.id],
    relationName: 'clonedFromEdition',
  }),
  clonedEditions: many(eventEditions, {
    relationName: 'clonedFromEdition',
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
  groupRegistrationBatches: many(groupRegistrationBatches),
  groupUploadLinks: many(groupUploadLinks),
  registrationInvites: many(registrationInvites),
  groupDiscountRules: many(groupDiscountRules),
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
  groupRegistrationBatches: many(groupRegistrationBatches),
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
  groupRegistrationBatchRows: many(groupRegistrationBatchRows),
  registrationInvites: many(registrationInvites),
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

export const eventSlugRedirectsRelations = relations(eventSlugRedirects, () => ({}));

export const groupRegistrationBatchesRelations = relations(groupRegistrationBatches, ({ one, many }) => ({
  edition: one(eventEditions, {
    fields: [groupRegistrationBatches.editionId],
    references: [eventEditions.id],
  }),
  createdByUser: one(users, {
    fields: [groupRegistrationBatches.createdByUserId],
    references: [users.id],
  }),
  uploadLink: one(groupUploadLinks, {
    fields: [groupRegistrationBatches.uploadLinkId],
    references: [groupUploadLinks.id],
  }),
  distance: one(eventDistances, {
    fields: [groupRegistrationBatches.distanceId],
    references: [eventDistances.id],
  }),
  sourceFile: one(media, {
    fields: [groupRegistrationBatches.sourceFileMediaId],
    references: [media.id],
  }),
  rows: many(groupRegistrationBatchRows),
  invites: many(registrationInvites),
}));

export const groupRegistrationBatchRowsRelations = relations(groupRegistrationBatchRows, ({ one, many }) => ({
  batch: one(groupRegistrationBatches, {
    fields: [groupRegistrationBatchRows.batchId],
    references: [groupRegistrationBatches.id],
  }),
  createdRegistration: one(registrations, {
    fields: [groupRegistrationBatchRows.createdRegistrationId],
    references: [registrations.id],
  }),
  invites: many(registrationInvites),
}));

export const groupUploadLinksRelations = relations(groupUploadLinks, ({ one, many }) => ({
  edition: one(eventEditions, {
    fields: [groupUploadLinks.editionId],
    references: [eventEditions.id],
  }),
  createdBy: one(users, {
    fields: [groupUploadLinks.createdByUserId],
    references: [users.id],
    relationName: 'groupUploadLinksCreatedBy',
  }),
  revokedBy: one(users, {
    fields: [groupUploadLinks.revokedByUserId],
    references: [users.id],
    relationName: 'groupUploadLinksRevokedBy',
  }),
  batches: many(groupRegistrationBatches),
  invites: many(registrationInvites),
}));

export const registrationInvitesRelations = relations(registrationInvites, ({ one, many }) => ({
  edition: one(eventEditions, {
    fields: [registrationInvites.editionId],
    references: [eventEditions.id],
  }),
  uploadLink: one(groupUploadLinks, {
    fields: [registrationInvites.uploadLinkId],
    references: [groupUploadLinks.id],
  }),
  batch: one(groupRegistrationBatches, {
    fields: [registrationInvites.batchId],
    references: [groupRegistrationBatches.id],
  }),
  batchRow: one(groupRegistrationBatchRows, {
    fields: [registrationInvites.batchRowId],
    references: [groupRegistrationBatchRows.id],
  }),
  registration: one(registrations, {
    fields: [registrationInvites.registrationId],
    references: [registrations.id],
  }),
  supersedesInvite: one(registrationInvites, {
    fields: [registrationInvites.supersedesInviteId],
    references: [registrationInvites.id],
    relationName: 'registrationInvitesSupersedes',
  }),
  supersededBy: many(registrationInvites, {
    relationName: 'registrationInvitesSupersedes',
  }),
  createdByUser: one(users, {
    fields: [registrationInvites.createdByUserId],
    references: [users.id],
    relationName: 'registrationInvitesCreatedBy',
  }),
  claimedByUser: one(users, {
    fields: [registrationInvites.claimedByUserId],
    references: [users.id],
    relationName: 'registrationInvitesClaimedBy',
  }),
}));

export const groupDiscountRulesRelations = relations(groupDiscountRules, ({ one }) => ({
  edition: one(eventEditions, {
    fields: [groupDiscountRules.editionId],
    references: [eventEditions.id],
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
