/**
 * Event platform constants and type definitions.
 * These constants define the taxonomy for sports/event types, visibility states,
 * registration statuses, and other domain-specific values.
 */

// Sport/event type taxonomy (RunGoMx-specific)
export const SPORT_TYPES = [
  'trail_running',
  'triathlon',
  'cycling',
  'mtb',
  'gravel_bike',
  'duathlon',
  'backyard_ultra',
] as const;
export type SportType = (typeof SPORT_TYPES)[number];

// Event visibility states (lifecycle)
export const EVENT_VISIBILITY = ['draft', 'published', 'unlisted', 'archived'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITY)[number];

// Event series status
export const EVENT_SERIES_STATUS = ['active', 'archived'] as const;
export type EventSeriesStatus = (typeof EVENT_SERIES_STATUS)[number];

// Registration status (lifecycle)
export const REGISTRATION_STATUS = [
  'started',
  'submitted',
  'payment_pending',
  'confirmed',
  'cancelled',
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUS)[number];

// Organization membership roles (ordered by privilege level)
export const ORG_MEMBERSHIP_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type OrgMembershipRole = (typeof ORG_MEMBERSHIP_ROLES)[number];

// Distance units
export const DISTANCE_UNITS = ['km', 'mi'] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

// Distance kinds (distance-based vs time-based events)
export const DISTANCE_KINDS = ['distance', 'timed'] as const;
export type DistanceKind = (typeof DISTANCE_KINDS)[number];

// Terrain types
export const TERRAIN_TYPES = ['road', 'trail', 'mixed'] as const;
export type TerrainType = (typeof TERRAIN_TYPES)[number];

// Capacity scope (how capacity is counted)
export const CAPACITY_SCOPES = ['per_distance', 'shared_pool'] as const;
export type CapacityScope = (typeof CAPACITY_SCOPES)[number];

// Media kinds
export const MEDIA_KINDS = ['image', 'pdf', 'document'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

// Waiver signature types
export const SIGNATURE_TYPES = ['checkbox', 'initials', 'signature'] as const;
export type SignatureType = (typeof SIGNATURE_TYPES)[number];

// Human-readable labels for sport types (for UI display)
export const SPORT_TYPE_LABELS: Record<SportType, { en: string; es: string }> = {
  trail_running: { en: 'Trail Running', es: 'Trail Running' },
  triathlon: { en: 'Triathlon', es: 'Triatlón' },
  cycling: { en: 'Cycling', es: 'Ciclismo' },
  mtb: { en: 'Mountain Biking', es: 'Ciclismo de Montaña' },
  gravel_bike: { en: 'Gravel Bike', es: 'Gravel Bike' },
  duathlon: { en: 'Duathlon', es: 'Duatlón' },
  backyard_ultra: { en: 'Backyard Ultra', es: 'Backyard Ultra' },
};

// Human-readable labels for visibility states
export const EVENT_VISIBILITY_LABELS: Record<EventVisibility, { en: string; es: string }> = {
  draft: { en: 'Draft', es: 'Borrador' },
  published: { en: 'Published', es: 'Publicado' },
  unlisted: { en: 'Unlisted', es: 'No listado' },
  archived: { en: 'Archived', es: 'Archivado' },
};

// Human-readable labels for registration statuses
export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, { en: string; es: string }> = {
  started: { en: 'Started', es: 'Iniciado' },
  submitted: { en: 'Submitted', es: 'Enviado' },
  payment_pending: { en: 'Payment Pending', es: 'Pago Pendiente' },
  confirmed: { en: 'Confirmed', es: 'Confirmado' },
  cancelled: { en: 'Cancelled', es: 'Cancelado' },
};

// Human-readable labels for org membership roles
export const ORG_MEMBERSHIP_ROLE_LABELS: Record<OrgMembershipRole, { en: string; es: string }> = {
  owner: { en: 'Owner', es: 'Propietario' },
  admin: { en: 'Admin', es: 'Administrador' },
  editor: { en: 'Editor', es: 'Editor' },
  viewer: { en: 'Viewer', es: 'Visualizador' },
};

// Role hierarchy for permission checks (lower index = higher privilege)
export const ORG_ROLE_HIERARCHY: Record<OrgMembershipRole, number> = {
  owner: 0,
  admin: 1,
  editor: 2,
  viewer: 3,
};

/**
 * Check if a role has at least the required privilege level.
 * @param userRole The user's current role
 * @param requiredRole The minimum required role
 * @returns true if userRole has equal or higher privilege than requiredRole
 */
export function hasMinimumRole(userRole: OrgMembershipRole, requiredRole: OrgMembershipRole): boolean {
  return ORG_ROLE_HIERARCHY[userRole] <= ORG_ROLE_HIERARCHY[requiredRole];
}
