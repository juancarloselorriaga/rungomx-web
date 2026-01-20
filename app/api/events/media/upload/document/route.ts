import { put } from '@vercel/blob';
import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth/server';
import { db } from '@/db';
import { organizations } from '@/db/schema';
import { EVENT_MEDIA_MAX_FILE_SIZE } from '@/lib/events/media/constants';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

const ACCEPTED_DOCUMENT_TYPES = ['application/pdf'] as const;

export async function POST(request: Request): Promise<NextResponse> {
  const authContext = await getAuthContext();

  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const pathname = url.searchParams.get('pathname');
  const organizationId = url.searchParams.get('organizationId');

  if (!pathname) {
    return NextResponse.json({ error: 'Missing pathname' }, { status: 400 });
  }

  if (!organizationId) {
    return NextResponse.json({ error: 'Missing organizationId' }, { status: 400 });
  }

  // Check permissions
  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, organizationId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }
  }

  // Verify organization exists
  const orgExists = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)),
  });
  if (!orgExists) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type (only PDFs allowed for document upload)
    if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type as (typeof ACCEPTED_DOCUMENT_TYPES)[number])) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    // Validate file size
    if (file.size > EVENT_MEDIA_MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    // Upload to Vercel Blob
    const blob = await put(pathname, file, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      size: file.size,
    });
  } catch (error) {
    console.error('[events-media-upload-document] Error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
