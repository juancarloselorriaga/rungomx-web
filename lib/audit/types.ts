/**
 * Type definitions for the audit logging system.
 */

import type { AUDIT_ACTIONS } from './actions';

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/**
 * Parameters for creating an audit log entry.
 */
export interface CreateAuditLogParams {
  /** Organization ID (required for org-scoped event audits) */
  organizationId: string;
  /** User ID of the actor performing the action */
  actorUserId: string;
  /** The action being performed */
  action: AuditAction;
  /** The type of entity being modified (e.g., 'event_edition', 'organization') */
  entityType: string;
  /** The ID of the entity being modified */
  entityId: string;
  /** The state of the entity before the change (for updates/deletes) */
  before?: Record<string, unknown>;
  /** The state of the entity after the change (for creates/updates) */
  after?: Record<string, unknown>;
  /** Request context for tracking the source of the action */
  request?: {
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * Result of creating an audit log entry.
 */
export interface CreateAuditLogResult {
  ok: boolean;
  auditLogId?: string;
  error?: string;
}

/**
 * Entity types that can be audited.
 * Keep this in sync with the database schema.
 */
export const AUDIT_ENTITY_TYPES = [
  'organization',
  'organization_membership',
  'event_series',
  'event_edition',
  'event_distance',
  'event_faq_item',
  'pricing_tier',
  'registration',
  'registrant',
  'waiver',
  'waiver_acceptance',
  'event_website_content',
  'media',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
