import { NextResponse } from 'next/server';

import {
  type AuthenticatedContext,
  requireAuthenticatedUser,
  UnauthenticatedError,
} from '@/lib/auth/guards';

export function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function requireAuthenticatedPaymentsContext(): Promise<
  { ok: true; context: AuthenticatedContext } | { ok: false; response: NextResponse }
> {
  try {
    const context = await requireAuthenticatedUser();
    return { ok: true, context };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return {
        ok: false,
        response: withNoStore(NextResponse.json({ error: 'Unauthorized' }, { status: 401 })),
      };
    }

    throw error;
  }
}
