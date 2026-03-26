import { siteUrl } from '@/config/url';
import { auth } from '@/lib/auth';
import { extractLocaleFromCallbackURL } from '@/lib/utils/locale';
import { APIError } from 'better-auth/api';
import { toNextJsHandler } from 'better-auth/next-js';
import { NextResponse } from 'next/server';

const handler = toNextJsHandler(auth.handler);
const TRACE_PATHS = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-up/email',
  '/api/auth/verify-email',
  '/api/auth/send-verification-email',
  '/api/auth/sign-out',
  '/api/auth/request-password-reset',
  '/api/auth/reset-password',
]);

type AuthTraceMeta = Record<string, boolean | number | string | null | undefined>;

function buildRequestId(request: Request): string {
  const headerRequestId =
    request.headers.get('x-request-id') ??
    request.headers.get('x-vercel-id') ??
    request.headers.get('x-correlation-id');
  return headerRequestId?.trim() || crypto.randomUUID();
}

function shouldTracePath(pathname: string): boolean {
  if (TRACE_PATHS.has(pathname)) return true;
  return false;
}

function traceAuth(
  level: 'info' | 'warn' | 'error',
  message: string,
  requestId: string,
  meta: AuthTraceMeta,
) {
  const payload = {
    requestId,
    scope: 'auth',
    ...meta,
  };

  if (level === 'error') {
    console.error(message, payload);
    return;
  }
  if (level === 'warn') {
    console.warn(message, payload);
    return;
  }
  console.info(message, payload);
}

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
    const startedAt = Date.now();
    const requestId = buildRequestId(request);
    const requestUrl = new URL(request.url);
    const path = requestUrl.pathname;
    const tracePath = shouldTracePath(path);
    const hasToken = requestUrl.searchParams.has('token');
    const hasCallback = requestUrl.searchParams.has('callbackURL');

    try {
      const response = await fn(request);
      const durationMs = Date.now() - startedAt;

      if (tracePath || response.status >= 400) {
        traceAuth(
          response.status >= 400 ? 'warn' : 'info',
          'auth.request.completed',
          requestId,
          {
            method: request.method,
            path,
            status: response.status,
            durationMs,
            hasToken,
            hasCallback,
          },
        );
      }

      return response;
    } catch (error) {
      if (error instanceof APIError) {
        const isVerificationLink =
          request.method === 'GET' &&
          requestUrl.searchParams.has('token') &&
          isEmailVerificationCallbackURL(requestUrl.searchParams.get('callbackURL'));

        if (isVerificationLink) {
          return NextResponse.redirect(buildVerifyEmailRedirect(request), { status: 302 });
        }

        // Avoid user enumeration: collapse 404 from auth endpoints into a generic 401.
        const statusCode = (() => {
          const value = (error as unknown as { statusCode?: unknown }).statusCode;
          if (typeof value === 'number' && Number.isFinite(value)) return value;
          if (typeof error.status === 'number' && Number.isFinite(error.status)) return error.status;
          if (typeof error.status === 'string') {
            const parsed = Number.parseInt(error.status, 10);
            return Number.isFinite(parsed) ? parsed : undefined;
          }
          return undefined;
        })();

        const normalizedStatus = statusCode === 404 ? 401 : (statusCode ?? 401);
        const status = Number.isFinite(normalizedStatus) ? normalizedStatus : 401;
        const message =
          status === 401 ? 'Invalid email or password' : (error.message ?? 'Authentication failed');

        traceAuth(status >= 500 ? 'error' : 'warn', 'auth.request.api-error', requestId, {
          method: request.method,
          path,
          status,
          durationMs: Date.now() - startedAt,
          isVerificationLink,
          hasToken,
          hasCallback,
          errorName: error.name,
          errorMessage: error.message ?? null,
        });

        return NextResponse.json({ error: message }, { status });
      }

      traceAuth('error', 'auth.request.unhandled-error', requestId, {
        method: request.method,
        path,
        status: 500,
        durationMs: Date.now() - startedAt,
        hasToken,
        hasCallback,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
    }
  };
};

export const GET = withErrorHandling(handler.GET);
export const POST = withErrorHandling(handler.POST);
export const PATCH = withErrorHandling(handler.PATCH);
export const PUT = withErrorHandling(handler.PUT);
export const DELETE = withErrorHandling(handler.DELETE);
