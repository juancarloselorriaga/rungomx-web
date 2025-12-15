'use server';

import { auth } from '@/lib/auth';
import { ProfileIncompleteError, requireProfileCompleteUser } from '@/lib/auth/guards';
import { getAuthContext } from '@/lib/auth/server';
import {
  ContactSubmissionRecord,
  contactSubmissionSchema,
  createContactSubmission,
  notifySupportOfSubmission,
} from '@/lib/contact-submissions';
import { checkRateLimit } from '@/lib/rate-limit';
import { extractLocaleFromRequest } from '@/lib/utils/locale';
import { headers } from 'next/headers';
import { z } from 'zod';

const submitSchema = contactSubmissionSchema.omit({ userId: true });
export type SubmitContactSubmissionInput = z.infer<typeof submitSchema>;

type ReadonlyHeaderLike = {
  get(name: string): string | null | undefined;
};

function collectRequestMetadata(h: ReadonlyHeaderLike): Record<string, unknown> {
  return {
    referer: h.get('referer'),
    userAgent: h.get('user-agent'),
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('cf-connecting-ip'),
    host: h.get('host'),
  };
}

export async function submitContactSubmission(payload: SubmitContactSubmissionInput) {
  try {
    // 1. Validate input
    const parsed = submitSchema.safeParse(payload);

    if (!parsed.success) {
      return {
        ok: false as const,
        error: 'INVALID_INPUT',
        details: z.treeifyError(parsed.error),
      };
    }

    // 2. Check honeypot
    if (parsed.data.honeypot && parsed.data.honeypot.length > 0) {
      // Bot detected - fail silently
      console.warn('[contact-submission] Honeypot triggered', {
        honeypot: parsed.data.honeypot,
      });
      return {
        ok: false as const,
        error: 'VALIDATION_ERROR',
      };
    }

    const h = await headers();
    const locale = extractLocaleFromRequest({
      headers: h,
      url: h.get('referer') ?? undefined,
    });
    const authContext = await getAuthContext();

    if (authContext.user) {
      try {
        await requireProfileCompleteUser();
      } catch (error) {
        if (error instanceof ProfileIncompleteError) {
          return {
            ok: false as const,
            error: 'PROFILE_INCOMPLETE',
            profileStatus: error.profileStatus,
          };
        }
        // Ignore unauthenticated errors to allow anonymous submissions; other errors propagate
      }
    }

    let session = authContext.session;
    if (!session) {
      session = await auth.api.getSession({ headers: h }).catch(() => null);
    }
    const metadata = collectRequestMetadata(h);

    // 3. Check rate limits
    const ip = metadata.ip as string | undefined;
    const userId = session?.user?.id;

    // Check IP-based rate limit for anonymous users
    if (!userId && ip) {
      const rateLimitResult = await checkRateLimit(ip, 'ip');
      if (!rateLimitResult.allowed) {
        console.warn('[contact-submission] Rate limit exceeded', {
          ip,
          resetAt: rateLimitResult.resetAt,
        });
        return {
          ok: false as const,
          error: 'RATE_LIMIT_EXCEEDED',
          resetAt: rateLimitResult.resetAt.toISOString(),
        };
      }
    }

    // Check user-based rate limit for authenticated users
    if (userId) {
      const rateLimitResult = await checkRateLimit(userId, 'user');
      if (!rateLimitResult.allowed) {
        console.warn('[contact-submission] Rate limit exceeded', {
          userId,
          resetAt: rateLimitResult.resetAt,
        });
        return {
          ok: false as const,
          error: 'RATE_LIMIT_EXCEEDED',
          resetAt: rateLimitResult.resetAt.toISOString(),
        };
      }
    }

    // 4. Prepare submission data
    const submissionData = {
      ...parsed.data,
      name: parsed.data.name ?? session?.user?.name,
      email: parsed.data.email ?? session?.user?.email,
      userId: session?.user?.id,
      metadata: {
        ...(parsed.data.metadata ?? {}),
        preferredLocale: locale,
        ...metadata,
      },
    };

    // 5. Send email FIRST (before saving to database)
    try {
      // Create temporary submission object for email
      const tempSubmission = {
        id: 'pending',
        ...submissionData,
        createdAt: new Date(),
      } as ContactSubmissionRecord;

      await notifySupportOfSubmission(tempSubmission, locale);
    } catch (error) {
      console.error('[contact-submission] Email failed, aborting submission', error);
      return {
        ok: false as const,
        error: 'EMAIL_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // 6. Email succeeded - now save to database
    const submission = await createContactSubmission(submissionData);

    return {
      ok: true as const,
      id: submission.id,
    };
  } catch (error) {
    console.error('[contact-submission] Unexpected error', error);
    return {
      ok: false as const,
      error: 'SERVER_ERROR',
    };
  }
}
