import QRCode from 'qrcode';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { buildRegistrationQrPayload } from '@/lib/events/tickets';

const registrationIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
): Promise<NextResponse> {
  const { registrationId } = await params;
  const parsed = registrationIdSchema.safeParse(registrationId);

  if (!parsed.success) {
    return new NextResponse('Invalid registration ID', { status: 400 });
  }

  try {
    const pngBuffer = await QRCode.toBuffer(buildRegistrationQrPayload(parsed.data), {
      errorCorrectionLevel: 'M',
      type: 'png',
      width: 280,
      margin: 1,
    });

    const body = new Uint8Array(pngBuffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[ticket-qr] Failed to generate QR code:', error);
    return new NextResponse('QR generation failed', { status: 500 });
  }
}
