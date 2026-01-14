import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { createAuditLog, getRequestContext } from '@/lib/audit';
import { getAuthContext } from '@/lib/auth/server';
import { db } from '@/db';
import { media, organizations } from '@/db/schema';
import type { MediaKind } from '@/lib/events/constants';
import { EVENT_MEDIA_ALLOWED_TYPES, EVENT_MEDIA_BLOB_PREFIX, EVENT_MEDIA_MAX_FILE_SIZE } from '@/lib/events/media/constants';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

type UploadTokenPayload = {
  userId: string;
  organizationId: string;
  purpose?: string;
  mediaId: string;
};

function resolveMediaKind(contentType?: string | null): MediaKind {
  if (!contentType) return 'document';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType === 'application/pdf') return 'pdf';
  return 'document';
}

export async function POST(request: Request): Promise<NextResponse> {
  const authContext = await getAuthContext();

  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;
  let pendingMediaId: string | null = null;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith(EVENT_MEDIA_BLOB_PREFIX)) {
          throw new Error('Invalid upload path');
        }

        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        const organizationId = payload.organizationId as string | undefined;
        const purpose = payload.purpose as string | undefined;

        if (!organizationId) {
          throw new Error('Missing organization');
        }

        if (!authContext.permissions.canManageEvents) {
          const membership = await getOrgMembership(authContext.user!.id, organizationId);
          try {
            requireOrgPermission(membership, 'canEditEventConfig');
          } catch {
            throw new Error('Permission denied');
          }
        }

        const orgExists = await db.query.organizations.findFirst({
          where: and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)),
        });
        if (!orgExists) {
          throw new Error('Organization not found');
        }

        const mediaId = crypto.randomUUID();
        pendingMediaId = mediaId;

        return {
          allowedContentTypes: [...EVENT_MEDIA_ALLOWED_TYPES],
          maximumSizeInBytes: EVENT_MEDIA_MAX_FILE_SIZE,
          tokenPayload: JSON.stringify({
            userId: authContext.user!.id,
            organizationId,
            purpose,
            mediaId,
          } satisfies UploadTokenPayload),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) {
          throw new Error('Missing token payload');
        }

        const { userId, organizationId, purpose, mediaId } = JSON.parse(
          tokenPayload,
        ) as UploadTokenPayload;

        const kind =
          purpose === 'event-hero-image' ? 'image' : resolveMediaKind(blob.contentType);
        const sizeBytes =
          (blob as { size?: number; contentLength?: number }).size ??
          (blob as { contentLength?: number }).contentLength ??
          null;
        const requestContext = await getRequestContext(await headers());

        await db.transaction(async (tx) => {
          const existing = await tx.query.media.findFirst({
            where: and(
              eq(media.organizationId, organizationId),
              eq(media.blobUrl, blob.url),
              isNull(media.deletedAt),
            ),
          });

          if (existing) {
            return;
          }

          const [created] = await tx
            .insert(media)
            .values({
              id: mediaId,
              organizationId,
              blobUrl: blob.url,
              kind,
              mimeType: blob.contentType ?? null,
              sizeBytes,
            })
            .returning();

          const auditResult = await createAuditLog(
            {
              organizationId,
              actorUserId: userId,
              action: 'media.upload',
              entityType: 'media',
              entityId: created.id,
              after: {
                blobUrl: created.blobUrl,
                kind: created.kind,
                mimeType: created.mimeType,
                sizeBytes: created.sizeBytes,
                purpose,
              },
              request: requestContext,
            },
            tx,
          );

          if (!auditResult.ok) {
            throw new Error('Failed to create audit log');
          }
        });
      },
    });

    return NextResponse.json(
      pendingMediaId && jsonResponse.type === 'blob.generate-client-token'
        ? { ...jsonResponse, mediaId: pendingMediaId }
        : jsonResponse,
    );
  } catch (error) {
    console.error('[events-media] Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
