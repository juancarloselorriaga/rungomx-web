'use client';

import { upload } from '@vercel/blob/client';

import type { MediaKind } from '@/lib/events/constants';
import { confirmEventMediaUpload } from '@/lib/events/actions';
import { EVENT_MEDIA_BLOB_PREFIX } from '@/lib/events/media/constants';

export async function uploadEventMediaFile({
  organizationId,
  file,
  kind,
  purpose,
}: {
  organizationId: string;
  file: File;
  kind: MediaKind;
  purpose?: string;
}): Promise<{ mediaId: string; blobUrl: string }> {
  const timestamp = Date.now();
  const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const pathname = `${EVENT_MEDIA_BLOB_PREFIX}/${organizationId}/${timestamp}-${safeFilename}`;

  const blob = await upload(pathname, file, {
    access: 'public',
    handleUploadUrl: '/api/events/media',
    clientPayload: JSON.stringify({
      organizationId,
      purpose,
    }),
  });

  const confirmResult = await confirmEventMediaUpload({
    organizationId,
    blobUrl: blob.url,
    kind,
  });

  if (!confirmResult.ok) {
    throw new Error(confirmResult.error || 'Upload failed');
  }

  return {
    mediaId: confirmResult.data.mediaId,
    blobUrl: confirmResult.data.blobUrl,
  };
}
