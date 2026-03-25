import { z } from 'zod';

import { PAYMENT_RESPONSIBILITIES } from '@/lib/events/constants';

export const createUploadLinkSchema = z.object({
  editionId: z.string().uuid(),
  name: z.string().max(255).optional().nullable(),
  paymentResponsibility: z.enum(PAYMENT_RESPONSIBILITIES).default('self_pay'),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  maxBatches: z.number().int().positive().optional().nullable(),
  maxInvites: z.number().int().positive().optional().nullable(),
});

export const revokeUploadLinkSchema = z.object({
  uploadLinkId: z.string().uuid(),
});

export const listUploadLinksSchema = z.object({
  editionId: z.string().uuid(),
});

export const createBatchSchema = z.object({
  uploadToken: z.string().min(1),
  distanceId: z.string().uuid(),
});

export const uploadBatchSchema = z.object({
  uploadToken: z.string().min(1),
  batchId: z.string().uuid(),
  mediaUrl: z.string().url(),
});

export const reserveInvitesSchema = z.object({
  uploadToken: z.string().min(1),
  batchId: z.string().uuid(),
  limit: z.number().int().positive().max(100).optional(),
  locale: z.string().min(2).max(10),
});

export const sendInvitesSchema = z.object({
  uploadToken: z.string().min(1),
  batchId: z.string().uuid(),
  limit: z.number().int().positive().max(50).optional(),
});

export const resendInviteSchema = z.object({
  uploadToken: z.string().min(1),
  inviteId: z.string().uuid(),
});

export const rotateInviteSchema = z.object({
  uploadToken: z.string().min(1),
  inviteId: z.string().uuid(),
});

export const updateInviteEmailSchema = z.object({
  uploadToken: z.string().min(1),
  inviteId: z.string().uuid(),
  email: z.string().email(),
});

export const reissueInviteForRowSchema = z.object({
  uploadToken: z.string().min(1),
  batchRowId: z.string().uuid(),
  locale: z.string().min(2).max(10),
});

export const extendInviteHoldSchema = z.object({
  uploadToken: z.string().min(1),
  inviteId: z.string().uuid(),
});

export const cancelInviteSchema = z.object({
  uploadToken: z.string().min(1),
  inviteId: z.string().uuid(),
});

export const cancelBatchSchema = z.object({
  uploadToken: z.string().min(1),
  batchId: z.string().uuid(),
});
