import { siteUrl } from '@/config/url';
import { auth } from '@/lib/auth';
import { extractLocaleFromCallbackURL } from '@/lib/utils/locale';
import { APIError } from 'better-auth/api';
import { toNextJsHandler } from 'better-auth/next-js';
import { NextResponse } from 'next/server';

const handler = toNextJsHandler(auth.handler);

function isEmailVerificationCallbackURL(callbackURL: string | null) {
  if (!callbackURL) return false;

  try {
    const cbUrl = new URL(callbackURL);
    return cbUrl.pathname.includes('/verify-email-success');
  } catch {
    return callbackURL.includes('/verify-email-success');
  }
}

function extractNestedCallbackPath(callbackURL: string | null) {
  if (!callbackURL) return undefined;

  try {
    const cbUrl = new URL(callbackURL);
    return cbUrl.searchParams.get('callbackURL') ?? undefined;
  } catch {
    // Handle path-only URLs like "/en/verify-email-success?callbackURL=/en/dashboard"
    const queryIndex = callbackURL.indexOf('?');
    if (queryIndex !== -1) {
      const search = callbackURL.slice(queryIndex);
      const params = new URLSearchParams(search);
      const nested = params.get('callbackURL');
      if (nested) {
        return nested;
      }
    }

    return callbackURL.startsWith('/') ? callbackURL : undefined;
  }
}

function buildVerifyEmailRedirect(request: Request) {
  const url = new URL(request.url);
  const callbackURL = url.searchParams.get('callbackURL') ?? '';
  const locale = extractLocaleFromCallbackURL(callbackURL, request);
  const redirectUrl = new URL(`${siteUrl}/${locale}/verify-email`);

  const nestedCallbackPath = extractNestedCallbackPath(callbackURL);
  if (nestedCallbackPath) {
    redirectUrl.searchParams.set('callbackURL', nestedCallbackPath);
  }

  const email = url.searchParams.get('email');
  if (email) {
    redirectUrl.searchParams.set('email', email);
  }

  return redirectUrl;
}

const withErrorHandling = (fn: (request: Request) => Promise<Response>) => {
  return async (request: Request) => {
    try {
      return await fn(request);
    } catch (error) {
      if (error instanceof APIError) {
        const requestUrl = new URL(request.url);
        const isVerificationLink =
          request.method === 'GET' &&
          requestUrl.searchParams.has('token') &&
          isEmailVerificationCallbackURL(requestUrl.searchParams.get('callbackURL'));

        if (isVerificationLink) {
          return NextResponse.redirect(buildVerifyEmailRedirect(request), { status: 302 });
        }

        // Avoid user enumeration: collapse 404 from auth endpoints into a generic 401.
        const rawStatus =
          typeof error.status === 'string' ? Number.parseInt(error.status, 10) : error.status;
        const normalizedStatus = rawStatus === 404 ? 401 : (rawStatus ?? 401);
        const status = Number.isFinite(normalizedStatus) ? normalizedStatus : 401;
        const message =
          status === 401 ? 'Invalid email or password' : (error.message ?? 'Authentication failed');
        return NextResponse.json({ error: message }, { status });
      }

      console.error('Unhandled auth error', error);
      return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
    }
  };
};

export const GET = withErrorHandling(handler.GET);
export const POST = withErrorHandling(handler.POST);
export const PATCH = withErrorHandling(handler.PATCH);
export const PUT = withErrorHandling(handler.PUT);
export const DELETE = withErrorHandling(handler.DELETE);
