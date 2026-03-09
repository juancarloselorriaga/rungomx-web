import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  findActivePaymentsOrganization,
  parsePaymentsJsonBody,
  requireAuthenticatedPaymentsContext,
  requireOrganizerWriteAccess,
  withNoStore,
} from '@/app/api/payments/_shared';
import { DisputeLifecycleError, submitDisputeEvidence } from '@/lib/payments/disputes/lifecycle';

const paramsSchema = z.object({
  disputeCaseId: z.string().uuid(),
});

const evidenceReferenceSchema = z.object({
  referenceId: z.string().trim().min(1).max(128),
  referenceType: z.enum(['document', 'message', 'timeline', 'other']),
  referenceUrl: z.string().url().optional(),
  note: z.string().trim().max(500).optional(),
});

const evidenceSubmissionSchema = z
  .object({
    organizationId: z.string().uuid(),
    evidenceNote: z.string().trim().max(2000).optional(),
    evidenceReferences: z.array(evidenceReferenceSchema).max(25).optional(),
  })
  .refine(
    (payload) =>
      Boolean(
        (payload.evidenceNote && payload.evidenceNote.trim().length > 0) ||
        payload.evidenceReferences?.length,
      ),
    {
      message: 'Dispute evidence submission requires at least one note or evidence reference.',
      path: ['evidenceNote'],
    },
  );

export async function POST(
  request: Request,
  { params }: { params: Promise<{ disputeCaseId: string }> },
): Promise<NextResponse> {
  const authResult = await requireAuthenticatedPaymentsContext();

  if (!authResult.ok) {
    return authResult.response;
  }

  const authContext = authResult.context;

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid dispute case ID',
          details: parsedParams.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const payloadResult = await parsePaymentsJsonBody(request);
  if (!payloadResult.ok) {
    return payloadResult.response;
  }

  const parseResult = evidenceSubmissionSchema.safeParse(payloadResult.payload);
  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid dispute evidence payload',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId, evidenceNote, evidenceReferences } = parseResult.data;

  const accessResult = await requireOrganizerWriteAccess(authContext, organizationId);
  if (!accessResult.ok) {
    return accessResult.response;
  }

  const organizationResult = await findActivePaymentsOrganization(organizationId);
  if (!organizationResult.ok) {
    return organizationResult.response;
  }

  try {
    const submission = await submitDisputeEvidence({
      disputeCaseId: parsedParams.data.disputeCaseId,
      organizerId: organizationId,
      actorUserId: authContext.user.id,
      evidenceNote,
      evidenceReferences,
    });

    if (!submission.accepted) {
      return withNoStore(
        NextResponse.json(
          {
            error: 'Dispute evidence submission deadline expired',
            code: 'DISPUTE_EVIDENCE_DEADLINE_EXPIRED',
            nextAction: submission.nextAction,
            data: {
              disputeCaseId: submission.disputeCaseId,
              organizerId: submission.organizerId,
              status: submission.status,
              evidenceDeadlineAt: submission.evidenceDeadlineAt.toISOString(),
              asOf: submission.asOf.toISOString(),
              remainingSeconds: submission.remainingSeconds,
              deadlineState: submission.deadlineState,
            },
          },
          { status: 409 },
        ),
      );
    }

    return withNoStore(
      NextResponse.json({
        data: {
          disputeCaseId: submission.disputeCaseId,
          organizerId: submission.organizerId,
          status: submission.status,
          evidenceDeadlineAt: submission.evidenceDeadlineAt.toISOString(),
          asOf: submission.asOf.toISOString(),
          remainingSeconds: submission.remainingSeconds,
          deadlineState: submission.deadlineState,
          accepted: submission.accepted,
          nextAction: submission.nextAction,
          metadata: submission.metadata,
        },
      }),
    );
  } catch (error) {
    if (error instanceof DisputeLifecycleError) {
      if (error.code === 'DISPUTE_CASE_NOT_FOUND') {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Dispute case not found',
              code: error.code,
            },
            { status: 404 },
          ),
        );
      }

      if (
        error.code === 'DISPUTE_EVIDENCE_STATUS_INVALID' ||
        error.code === 'DISPUTE_EVIDENCE_UPDATE_FAILED'
      ) {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Dispute evidence submission rejected',
              code: error.code,
              reason: error.message,
            },
            { status: 409 },
          ),
        );
      }

      return withNoStore(
        NextResponse.json(
          {
            error: 'Invalid dispute evidence request',
            code: error.code,
            reason: error.message,
          },
          { status: 400 },
        ),
      );
    }

    console.error('[payments-disputes] Failed to submit dispute evidence', {
      disputeCaseId: parsedParams.data.disputeCaseId,
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });
    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
