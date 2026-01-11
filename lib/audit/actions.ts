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

  // FAQ Items
  'faq.create': 'FAQ item created',
  'faq.update': 'FAQ item updated',
  'faq.delete': 'FAQ item deleted',
  'faq.reorder': 'FAQ items reordered',

  // Website Content
  'website.update': 'Website content updated',

  // Media
  'media.upload': 'Media uploaded',
  'media.delete': 'Media deleted',

  // Registrations (access events - for sensitive data access logging)
  'registration.view': 'Registration viewed',
  'registration.export': 'Registrations exported',
  'registration.update': 'Registration updated',
  'registration.cancel': 'Registration cancelled',
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
