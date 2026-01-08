import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { users } from '@/db/schema';
import { ALLOWED_IMAGE_TYPES, BLOB_STORE_PREFIX, MAX_FILE_SIZE } from '@/lib/profile-picture/constants';
import { getAuthContext } from '@/lib/auth/server';
import { eq } from 'drizzle-orm';

export async function POST(request: Request): Promise<NextResponse> {
  const authContext = await getAuthContext();

  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (authContext.isInternal) {
    return NextResponse.json({ error: 'Profile pictures are not available for internal users' }, { status: 403 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Validate pathname starts with expected prefix
        if (!pathname.startsWith(BLOB_STORE_PREFIX)) {
          throw new Error('Invalid upload path');
        }

        // Parse client payload to check for allowOverwrite option
        const payload = clientPayload ? JSON.parse(clientPayload) : {};

        return {
          allowedContentTypes: [...ALLOWED_IMAGE_TYPES],
          maximumSizeInBytes: MAX_FILE_SIZE,
          allowOverwrite: payload.allowOverwrite === true,
          tokenPayload: JSON.stringify({
            userId: authContext.user!.id,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) {
          throw new Error('Missing token payload');
        }

        const { userId } = JSON.parse(tokenPayload) as { userId: string };

        // Update the user's image URL in the database
        await db.update(users).set({ image: blob.url }).where(eq(users.id, userId));
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('[profile-picture] Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
