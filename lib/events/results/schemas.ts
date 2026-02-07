import { z } from 'zod';

import {
  RESULT_INGESTION_SOURCE_LANES,
  RESULT_DISCIPLINES,
  RESULT_ENTRY_STATUSES,
  RESULT_VERSION_SOURCES,
} from '@/lib/events/results/types';

export const createResultDraftVersionSchema = z.object({
  editionId: z.string().uuid(),
  source: z.enum(RESULT_VERSION_SOURCES),
  sourceReference: z.string().trim().min(1).max(255).optional(),
  sourceFileChecksum: z.string().trim().min(1).max(128).optional(),
  parentResultVersionId: z.string().uuid().optional(),
});

export const initializeResultIngestionSessionSchema = z.object({
  editionId: z.string().uuid(),
  sourceLane: z.enum(RESULT_INGESTION_SOURCE_LANES),
  sourceReference: z.string().trim().min(1).max(255).optional(),
  sourceFileChecksum: z.string().trim().min(1).max(128).optional(),
});

export const finalizeResultVersionAttestationSchema = z.object({
  editionId: z.string().uuid(),
  attestationConfirmed: z.boolean().optional().default(false),
  attestationNote: z.string().trim().min(1).max(500).optional(),
});

export const upsertDraftResultEntrySchema = z.object({
  resultVersionId: z.string().uuid(),
  entryId: z.string().uuid().optional(),
  distanceId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  discipline: z.enum(RESULT_DISCIPLINES),
  runnerFullName: z.string().trim().min(1).max(255),
  bibNumber: z.string().trim().min(1).max(50).optional().nullable(),
  gender: z.string().trim().min(1).max(20).optional().nullable(),
  age: z.number().int().min(0).max(120).optional().nullable(),
  status: z.enum(RESULT_ENTRY_STATUSES).default('finish'),
  finishTimeMillis: z.number().int().positive().optional().nullable(),
  overallPlace: z.number().int().positive().optional().nullable(),
  genderPlace: z.number().int().positive().optional().nullable(),
  ageGroupPlace: z.number().int().positive().optional().nullable(),
  identitySnapshot: z.record(z.string(), z.unknown()).optional().default({}),
  rawSourceData: z.record(z.string(), z.unknown()).optional().default({}),
});

export const linkDraftResultEntryToUserSchema = z.object({
  resultVersionId: z.string().uuid(),
  entryId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const getRunnerResultClaimCandidatesSchema = z.object({
  limit: z.number().int().min(1).max(25).optional().default(10),
  minimumConfidence: z.number().min(0).max(1).optional().default(0.65),
});

export const confirmRunnerResultClaimSchema = z.object({
  entryId: z.string().uuid(),
});

export const reviewRunnerResultClaimSchema = z
  .object({
    claimId: z.string().uuid(),
    decision: z.enum(['approve', 'reject']),
    reviewReason: z.string().trim().min(1).max(120).optional(),
    reviewContextNote: z.string().trim().min(1).max(500).optional(),
  })
  .refine(
    (value) =>
      value.decision === 'approve' || Boolean(value.reviewReason || value.reviewContextNote),
    {
      message: 'Review reason is required when rejecting a claim',
      path: ['reviewReason'],
    },
  );

export const requestRunnerResultCorrectionSchema = z.object({
  entryId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  requestContext: z.record(z.string(), z.unknown()).optional().default({}),
});

export const reviewResultCorrectionRequestSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  reviewDecisionNote: z.string().trim().min(1).max(500).optional(),
});

export const publishApprovedCorrectionVersionSchema = z.object({
  requestId: z.string().uuid(),
});

export const resultEntryLookupSchema = z
  .object({
    resultVersionId: z.string().uuid(),
    bibNumber: z.string().trim().min(1).max(50).optional(),
    runnerFullName: z.string().trim().min(1).max(255).optional(),
    limit: z.number().int().min(1).max(100).optional().default(25),
  })
  .refine((value) => Boolean(value.bibNumber || value.runnerFullName), {
    message: 'Either bibNumber or runnerFullName must be provided',
    path: ['bibNumber'],
  });

export type CreateResultDraftVersionInput = z.input<typeof createResultDraftVersionSchema>;
export type InitializeResultIngestionSessionInput = z.input<
  typeof initializeResultIngestionSessionSchema
>;
export type FinalizeResultVersionAttestationInput = z.input<
  typeof finalizeResultVersionAttestationSchema
>;
export type UpsertDraftResultEntryInput = z.input<typeof upsertDraftResultEntrySchema>;
export type LinkDraftResultEntryToUserInput = z.input<typeof linkDraftResultEntryToUserSchema>;
export type GetRunnerResultClaimCandidatesInput = z.input<
  typeof getRunnerResultClaimCandidatesSchema
>;
export type ConfirmRunnerResultClaimInput = z.input<typeof confirmRunnerResultClaimSchema>;
export type ReviewRunnerResultClaimInput = z.input<typeof reviewRunnerResultClaimSchema>;
export type RequestRunnerResultCorrectionInput = z.input<typeof requestRunnerResultCorrectionSchema>;
export type ReviewResultCorrectionRequestInput = z.input<
  typeof reviewResultCorrectionRequestSchema
>;
export type PublishApprovedCorrectionVersionInput = z.input<
  typeof publishApprovedCorrectionVersionSchema
>;
export type ResultEntryLookupInput = z.input<typeof resultEntryLookupSchema>;
