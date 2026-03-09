import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import {
  type AuthenticatedContext,
  requireAuthenticatedUser,
  UnauthenticatedError,
} from '@/lib/auth/guards';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

export function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export function paymentsUnauthorizedResponse(): NextResponse {
  return withNoStore(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
}

export function paymentsPermissionDeniedResponse(): NextResponse {
  return withNoStore(NextResponse.json({ error: 'Permission denied' }, { status: 403 }));
}

export function paymentsOrganizationNotFoundResponse(): NextResponse {
  return withNoStore(NextResponse.json({ error: 'Organization not found' }, { status: 404 }));
}

export function paymentsInvalidJsonBodyResponse(): NextResponse {
  return withNoStore(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
}

export function paymentsServerErrorResponse(): NextResponse {
  return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
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
        response: paymentsUnauthorizedResponse(),
      };
    }

    throw error;
  }
}

export async function parsePaymentsJsonBody(
  request: Request,
): Promise<{ ok: true; payload: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, payload: await request.json() };
  } catch {
    return {
      ok: false,
      response: paymentsInvalidJsonBodyResponse(),
    };
  }
}

export function parsePaymentsQuery<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
  select: (searchParams: URLSearchParams) => unknown,
): z.ZodSafeParseResult<z.output<TSchema>> {
  const url = new URL(request.url);
  return schema.safeParse(select(url.searchParams));
}

export async function parsePaymentsRouteParams<TSchema extends z.ZodTypeAny>(
  params: Promise<unknown>,
  schema: TSchema,
): Promise<z.ZodSafeParseResult<z.output<TSchema>>> {
  return schema.safeParse(await params);
}

export async function requireOrganizerWriteAccess(
  authContext: AuthenticatedContext,
  organizationId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, organizationId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return {
        ok: false,
        response: paymentsPermissionDeniedResponse(),
      };
    }
  }

  return { ok: true };
}

export async function requireOrganizerReadAccess(
  authContext: AuthenticatedContext,
  organizationId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, organizationId);
    if (!membership) {
      return {
        ok: false,
        response: paymentsPermissionDeniedResponse(),
      };
    }
  }

  return { ok: true };
}

export async function findActivePaymentsOrganization(
  organizationId: string,
): Promise<{ ok: true; organization: { id: string } } | { ok: false; response: NextResponse }> {
  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)),
    columns: { id: true },
  });

  if (!organization) {
    return {
      ok: false,
      response: paymentsOrganizationNotFoundResponse(),
    };
  }

  return { ok: true, organization };
}
