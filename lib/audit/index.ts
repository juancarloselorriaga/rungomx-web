/**
 * Audit logging module.
 * Provides functions for creating and querying audit log entries.
 */

import { db } from '@/db';
import { auditLogs } from '@/db/schema';

import type { CreateAuditLogParams, CreateAuditLogResult } from './types';

export { AUDIT_ACTIONS, getAuditActionDescription } from './actions';
export type { AuditAction, AuditEntityType, CreateAuditLogParams, CreateAuditLogResult } from './types';

/**
 * Create an audit log entry.
 * This should be called after any mutation that needs to be tracked.
 *
 * **IMPORTANT**: For critical operations (event create/update, org changes), callers MUST
 * check the returned `ok` field and fail the operation if audit logging fails. This ensures
 * audit trail integrity per Phase 0 acceptance criteria.
 *
 * **TRANSACTIONAL USAGE**: Pass a transaction client (`tx`) to ensure audit logs are written
 * atomically with the mutation. This is REQUIRED for Phase 0 audit trail guarantees.
 *
 * @param params - The audit log parameters
 * @param tx - Optional transaction client. If provided, audit log will be written using this transaction.
 * @returns The result of the audit log creation (check `ok` field!)
 *
 * @example
 * // Log organization creation (transactional - REQUIRED for Phase 0)
 * const result = await db.transaction(async (tx) => {
 *   const [org] = await tx.insert(organizations).values({ ... }).returning();
 *   const auditResult = await createAuditLog({
 *     organizationId: org.id,
 *     actorUserId: authContext.user.id,
 *     action: 'org.create',
 *     entityType: 'organization',
 *     entityId: org.id,
 *     after: org,
 *     request: { ipAddress, userAgent },
 *   }, tx);
 *   if (!auditResult.ok) {
 *     throw new Error('Audit log failed');
 *   }
 *   return org;
 * });
 *
 * @example
 * // Log event update with before/after (transactional)
 * const result = await db.transaction(async (tx) => {
 *   await tx.update(eventEditions).set(updates).where(eq(eventEditions.id, id));
 *   const auditResult = await createAuditLog({
 *     organizationId: org.id,
 *     actorUserId: authContext.user.id,
 *     action: 'event.update',
 *     entityType: 'event_edition',
 *     entityId: id,
 *     before: previousState,
 *     after: newState,
 *     request: { ipAddress, userAgent },
 *   }, tx);
 *   if (!auditResult.ok) {
 *     throw new Error('Audit log failed');
 *   }
 * });
 */
export async function createAuditLog(
  params: CreateAuditLogParams,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any,
): Promise<CreateAuditLogResult> {
  try {
    const dbClient = tx || db;
    const [result] = await dbClient
      .insert(auditLogs)
      .values({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        beforeJson: params.before,
        afterJson: params.after,
        ipAddress: params.request?.ipAddress,
        userAgent: params.request?.userAgent,
      })
      .returning({ id: auditLogs.id });

    return {
      ok: true,
      auditLogId: result.id,
    };
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Return error result without throwing so callers can decide how to handle
    // For critical operations, callers MUST check this result and fail accordingly
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Helper to extract request context from headers.
 * Use this in server actions to get IP and user agent.
 *
 * @param headers - The request headers
 * @returns Object with ipAddress and userAgent
 *
 * @example
 * import { headers } from 'next/headers';
 *
 * const requestContext = await getRequestContext(await headers());
 * await createAuditLog({
 *   ...params,
 *   request: requestContext,
 * });
 */
export async function getRequestContext(
  headersObj: Headers,
): Promise<{ ipAddress?: string; userAgent?: string }> {
  const ipAddress =
    headersObj.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersObj.get('x-real-ip') ||
    undefined;
  const userAgent = headersObj.get('user-agent') || undefined;

  return { ipAddress, userAgent };
}
