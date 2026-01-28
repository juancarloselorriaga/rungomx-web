/**
 * Audit action constants.
 * These define all the actions that can be logged in the audit system.
 */

export const AUDIT_ACTIONS = {
  // Organizations
  'org.create': 'Organization created',
  'org.update': 'Organization updated',
  'org.delete': 'Organization deleted',
  'org.member.add': 'Member added to organization',
  'org.member.update': 'Member role updated',
  'org.member.remove': 'Member removed from organization',

  // Event Series
  'series.create': 'Event series created',
  'series.update': 'Event series updated',
  'series.archive': 'Event series archived',
  'series.delete': 'Event series deleted',

  // Event Editions
  'event.create': 'Event edition created',
  'event.clone': 'Event edition cloned',
  'event.update': 'Event edition updated',
  'event.publish': 'Event edition published',
  'event.unpublish': 'Event edition unpublished',
  'event.archive': 'Event edition archived',
  'event.delete': 'Event edition deleted',
  'event.pause_registration': 'Event registration paused',
  'event.resume_registration': 'Event registration resumed',

  // Distances
  'distance.create': 'Distance created',
  'distance.update': 'Distance updated',
  'distance.update_price': 'Distance price updated',
  'distance.delete': 'Distance deleted',

  // Pricing Tiers
  'pricing.create': 'Pricing tier created',
  'pricing.update': 'Pricing tier updated',
  'pricing.delete': 'Pricing tier deleted',

  // Waivers
  'waiver.create': 'Waiver created',
  'waiver.update': 'Waiver updated',
  'waiver.delete': 'Waiver deleted',
  'waiver.reorder': 'Waivers reordered',

  // FAQ Items
  'faq.create': 'FAQ item created',
  'faq.update': 'FAQ item updated',
  'faq.delete': 'FAQ item deleted',
  'faq.reorder': 'FAQ items reordered',

  // Website Content
  'website.update': 'Website content updated',

  // Policies
  'policy.update': 'Policy configuration updated',

  // Media
  'media.upload': 'Media uploaded',
  'media.delete': 'Media deleted',

  // Registrations (access events - for sensitive data access logging)
  'registration.create': 'Registration created',
  'registration.view': 'Registration viewed',
  'registration.export': 'Registrations exported',
  'registration.update': 'Registration updated',
  'registration.cancel': 'Registration cancelled',
  'registration.demo_pay': 'Registration demo payment completed',

  // Group Registrations (Phase 3)
  'group_registrations.upload': 'Group registrations batch uploaded',
  'group_registrations.process': 'Group registrations batch processed',
  'group_registrations.process_failed': 'Group registrations batch processing failed',
  'group_registrations.discount_rule.upsert': 'Group discount rule created or updated',
  // Group Upload Links (Invite/Claim)
  'group_upload_link.create': 'Group upload link created',
  'group_upload_link.revoke': 'Group upload link revoked',
  'group_upload_batch.create': 'Group upload batch created',
  'group_upload_batch.discount_apply': 'Group upload batch discount applied',
  'group_upload_invites.send': 'Group upload invites sent',
  'group_upload_invite.cancel': 'Group upload invite cancelled',
  'group_upload_batch.cancel': 'Group upload batch cancelled',
  'registration_invite.claim': 'Registration invite claimed',

  // Add-ons (Phase 2)
  'add_on.create': 'Add-on created',
  'add_on.update': 'Add-on updated',
  'add_on.delete': 'Add-on deleted',
  'add_on.reorder': 'Add-ons reordered',
  'add_on_option.create': 'Add-on option created',
  'add_on_option.update': 'Add-on option updated',
  'add_on_option.delete': 'Add-on option deleted',
  'add_on_selections.submit': 'Add-on selections submitted',

  // Discount Codes (Phase 2)
  'discount_code.create': 'Discount code created',
  'discount_code.update': 'Discount code updated',
  'discount_code.delete': 'Discount code deleted',
  'discount_code.apply': 'Discount code applied',
  'discount_code.remove': 'Discount code removed',

  // Registration Questions (Phase 2)
  'registration_question.create': 'Registration question created',
  'registration_question.update': 'Registration question updated',
  'registration_question.delete': 'Registration question deleted',
  'registration_question.reorder': 'Registration questions reordered',
  'registration_answers.submit': 'Registration answers submitted',

  // Payout Profile (Phase 2)
  'payout_profile.read': 'Payout profile viewed',
  'payout_profile.create': 'Payout profile created',
  'payout_profile.update': 'Payout profile updated',

  // Add-on Sales Export (Phase 2)
  'add_on_sales.export': 'Add-on sales exported',
} as const;

/**
 * Get a human-readable description for an audit action.
 *
 * @param action - The audit action key
 * @returns The human-readable description
 */
export function getAuditActionDescription(action: keyof typeof AUDIT_ACTIONS): string {
  return AUDIT_ACTIONS[action];
}
