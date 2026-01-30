import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { groupRegistrationBatches } from '@/db/schema';
import type { AuthContext } from '@/lib/auth/server';
import { canUserAccessEvent, requireOrgPermission } from '@/lib/organizations/permissions';
import { getUploadLinkByToken } from './queries';

export type BatchAccessResult = {
  batch: typeof groupRegistrationBatches.$inferSelect;
  uploadLink: NonNullable<Awaited<ReturnType<typeof getUploadLinkByToken>>['link']>;
  status: Awaited<ReturnType<typeof getUploadLinkByToken>>['status'];
  isStaff: boolean;
};

export class BatchAccessError extends Error {
  public readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'LINK_INVALID';

  constructor(code: 'NOT_FOUND' | 'FORBIDDEN' | 'LINK_INVALID', message: string) {
    super(message);
    this.code = code;
  }
}

export async function getBatchForCoordinatorOrThrow(params: {
  batchId: string;
  uploadToken: string;
  authContext: AuthContext;
  now?: Date;
  requireActiveLink?: boolean;
}) : Promise<BatchAccessResult> {
  const linkResult = await getUploadLinkByToken({ token: params.uploadToken, now: params.now });
  const requireActiveLink = params.requireActiveLink ?? true;
  if (!linkResult.link) {
    throw new BatchAccessError('LINK_INVALID', 'Upload link is not active');
  }

  if (requireActiveLink && !['ACTIVE', 'MAXED_OUT'].includes(linkResult.status)) {
    throw new BatchAccessError('LINK_INVALID', 'Upload link is not active');
  }

  if (!requireActiveLink && !['ACTIVE', 'EXPIRED', 'MAXED_OUT'].includes(linkResult.status)) {
    throw new BatchAccessError('LINK_INVALID', 'Upload link is not active');
  }

  const batch = await db.query.groupRegistrationBatches.findFirst({
    where: eq(groupRegistrationBatches.id, params.batchId),
  });

  if (!batch || batch.uploadLinkId !== linkResult.link.id) {
    throw new BatchAccessError('NOT_FOUND', 'Batch not found');
  }

  let isStaff = params.authContext.permissions.canManageEvents;

  if (!isStaff && params.authContext.permissions.canViewOrganizersDashboard) {
    const membership = await canUserAccessEvent(params.authContext.user!.id, linkResult.link.editionId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
      isStaff = true;
    } catch {
      isStaff = false;
    }
  }

  if (!isStaff && batch.createdByUserId !== params.authContext.user!.id) {
    throw new BatchAccessError('FORBIDDEN', 'Permission denied');
  }

  return {
    batch,
    uploadLink: linkResult.link,
    status: linkResult.status,
    isStaff,
  };
}
