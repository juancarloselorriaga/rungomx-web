import { NextResponse } from 'next/server';
import { z } from 'zod';

import { RegistrationOwnershipError } from '@/lib/events/registrations/ownership';
import { getAuthContext } from '@/lib/auth/server';
import {
  refundSubmissionReasonCodes,
  RefundRequestEligibilityError,
  submitAttendeeRefundRequest,
} from '@/lib/payments/refunds/request-submission';

const createRefundRequestSchema = z.object({
  registrationId: z.string().uuid(),
  reasonCode: z.enum(refundSubmissionReasonCodes),
  reasonNote: z.string().trim().max(2000).optional().nullable(),
});

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authContext = await getAuthContext();

  if (!authContext.user) {
    return withNoStore(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid JSON body',
        },
        { status: 400 },
      ),
    );
  }

  const parseResult = createRefundRequestSchema.safeParse(payload);
  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid refund request payload',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  try {
    const submitted = await submitAttendeeRefundRequest({
      registrationId: parseResult.data.registrationId,
      attendeeUserId: authContext.user.id,
      reasonCode: parseResult.data.reasonCode,
      reasonNote: parseResult.data.reasonNote ?? null,
    });

    return withNoStore(
      NextResponse.json(
        {
          data: {
            refundRequestId: submitted.id,
            registrationId: submitted.registrationId,
            status: submitted.status,
            reasonCode: submitted.reasonCode,
            reasonNote: submitted.reasonNote,
            requestedAt: submitted.requestedAt.toISOString(),
            policySnapshot: submitted.eligibilitySnapshot,
            financialSnapshot: submitted.financialSnapshot,
          },
        },
        { status: 201 },
      ),
    );
  } catch (error) {
    if (error instanceof RegistrationOwnershipError) {
      const status = error.code === 'NOT_FOUND' ? 404 : 403;
      const message = error.code === 'NOT_FOUND' ? 'Registration not found' : 'Permission denied';
      return withNoStore(
        NextResponse.json(
          {
            error: message,
            code: error.code,
          },
          { status },
        ),
      );
    }

    if (error instanceof RefundRequestEligibilityError) {
      return withNoStore(
        NextResponse.json(
          {
            error: 'Refund request is not eligible',
            reasonCode: error.code,
            reason: error.message,
          },
          { status: 409 },
        ),
      );
    }

    console.error('[payments-refunds] Failed to submit attendee refund request', {
      userId: authContext.user.id,
      error,
    });

    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
