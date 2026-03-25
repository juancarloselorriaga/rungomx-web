'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { withStaffUser } from '@/lib/auth/action-wrapper';
import { getRequestContext } from '@/lib/audit';
import type { FormActionResult } from '@/lib/forms';
import { validateInput } from '@/lib/forms';
import { safeRevalidateTag } from '@/lib/next-cache';
import {
  ArtifactGovernanceError,
  artifactGovernanceSummaryTag,
  getArtifactGovernanceSummary,
  rebuildArtifactForTrace,
  resendArtifactForTrace,
  type ArtifactGovernanceSummary,
} from '@/lib/payments/artifacts/governance';

const governanceOperationSchema = z.enum(['rebuild', 'resend']);
const artifactTypeSchema = z.enum(['payout_statement']);
const governanceActionSchema = z
  .object({
    operation: governanceOperationSchema,
    traceId: z.string().trim().min(1).max(128),
    artifactType: artifactTypeSchema.default('payout_statement'),
    reasonCode: z.string().trim().min(3).max(100),
    artifactVersion: z.preprocess(
      (value) => {
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'string' && value.trim().length === 0) return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : value;
      },
      z.number().int().positive().optional(),
    ),
    scopeTraceIds: z.string().optional(),
    scopeDateFrom: z.string().trim().optional(),
    scopeDateTo: z.string().trim().optional(),
  })
  .strict();

type GovernanceOperation = z.infer<typeof governanceOperationSchema>;
type ArtifactGovernanceValidationCode =
  | 'VALIDATION_FAILED'
  | 'REQUIRED_FIELD'
  | 'INVALID_NUMBER'
  | 'INVALID_STRING'
  | 'INVALID_ENUM';

function mapArtifactGovernanceValidationIssue(
  issue: z.ZodError['issues'][number],
): ArtifactGovernanceValidationCode | null {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type: {
      if (issue.path[0] === 'artifactVersion') {
        return 'INVALID_NUMBER';
      }

      return 'INVALID_STRING';
    }
    case z.ZodIssueCode.invalid_value:
      return 'INVALID_ENUM';
    case z.ZodIssueCode.too_small: {
      if (issue.origin === 'string') {
        return issue.minimum === 1 ? 'REQUIRED_FIELD' : 'INVALID_STRING';
      }

      if (issue.origin === 'number') {
        return 'INVALID_NUMBER';
      }

      return 'VALIDATION_FAILED';
    }
    case z.ZodIssueCode.too_big:
      return issue.origin === 'number' ? 'INVALID_NUMBER' : 'INVALID_STRING';
    default:
      return 'VALIDATION_FAILED';
  }
}

export type ArtifactGovernanceActionResult = {
  operation: GovernanceOperation;
  traceId: string;
  artifactType: z.infer<typeof artifactTypeSchema>;
  artifactVersion: number | null;
  versionId: string | null;
  deliveryId: string;
  rateLimitRemaining: number | null;
  rateLimitResetAtIso: string | null;
};

function parseActionInput(input: unknown): unknown {
  if (input instanceof FormData) {
    return {
      operation: input.get('operation'),
      traceId: input.get('traceId'),
      artifactType: input.get('artifactType'),
      reasonCode: input.get('reasonCode'),
      artifactVersion: input.get('artifactVersion'),
      scopeTraceIds: input.get('scopeTraceIds'),
      scopeDateFrom: input.get('scopeDateFrom'),
      scopeDateTo: input.get('scopeDateTo'),
    };
  }

  return input;
}

function parseScope(input: {
  scopeTraceIds?: string;
  scopeDateFrom?: string;
  scopeDateTo?: string;
}): {
  traceIds?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
} {
  const traceIds = input.scopeTraceIds
    ?.split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const dateFrom = input.scopeDateFrom?.trim();
  const dateTo = input.scopeDateTo?.trim();

  return {
    traceIds: traceIds && traceIds.length > 0 ? traceIds : undefined,
    dateFrom: dateFrom && dateFrom.length > 0 ? dateFrom : undefined,
    dateTo: dateTo && dateTo.length > 0 ? dateTo : undefined,
  };
}

export const runArtifactGovernanceAdminAction = withStaffUser<
  FormActionResult<ArtifactGovernanceActionResult>
>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(governanceActionSchema, parseActionInput(input), {
    issueMapper: mapArtifactGovernanceValidationIssue,
    validationMessage: 'VALIDATION_FAILED',
  });
  if (!validation.success) {
    return validation.error;
  }

  try {
    const requestContext = await getRequestContext(await headers());
    const scope = parseScope(validation.data);

    if (validation.data.operation === 'rebuild') {
      const rebuildResult = await rebuildArtifactForTrace({
        traceId: validation.data.traceId,
        artifactType: validation.data.artifactType,
        reasonCode: validation.data.reasonCode,
        actorUserId: authContext.user.id,
        scope,
        request: requestContext,
      });

      safeRevalidateTag(artifactGovernanceSummaryTag, { expire: 0 });
      return {
        ok: true,
        data: {
          operation: 'rebuild',
          traceId: rebuildResult.version.traceId,
          artifactType: rebuildResult.version.artifactType,
          artifactVersion: rebuildResult.version.artifactVersion,
          versionId: rebuildResult.version.id,
          deliveryId: rebuildResult.delivery.id,
          rateLimitRemaining: null,
          rateLimitResetAtIso: null,
        },
      };
    }

    const resendResult = await resendArtifactForTrace({
      traceId: validation.data.traceId,
      artifactType: validation.data.artifactType,
      reasonCode: validation.data.reasonCode,
      artifactVersion: validation.data.artifactVersion,
      actorUserId: authContext.user.id,
      scope,
      request: requestContext,
    });

    safeRevalidateTag(artifactGovernanceSummaryTag, { expire: 0 });
    return {
      ok: true,
      data: {
        operation: 'resend',
        traceId: resendResult.delivery.traceId,
        artifactType: resendResult.delivery.artifactType,
        artifactVersion: validation.data.artifactVersion ?? null,
        versionId: resendResult.delivery.artifactVersionId,
        deliveryId: resendResult.delivery.id,
        rateLimitRemaining: resendResult.rateLimit.remaining,
        rateLimitResetAtIso: resendResult.rateLimit.resetAt.toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof ArtifactGovernanceError) {
      return {
        ok: false,
        error: error.code,
        message: error.code,
      };
    }

    console.error('[payments-artifacts] Failed to run governance operation', error);
    return { ok: false, error: 'SERVER_ERROR', message: 'SERVER_ERROR' };
  }
});

export const listArtifactGovernanceSummaryAdminAction = withStaffUser<
  FormActionResult<ArtifactGovernanceSummary>
>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' }),
})(async () => {
  try {
    const summary = await getArtifactGovernanceSummary({ limit: 25 });
    return { ok: true, data: summary };
  } catch (error) {
    console.error('[payments-artifacts] Failed to list governance summary', error);
    return { ok: false, error: 'SERVER_ERROR', message: 'SERVER_ERROR' };
  }
});
