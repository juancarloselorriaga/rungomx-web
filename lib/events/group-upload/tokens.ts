import { createHash, createHmac, randomBytes } from 'crypto';

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getTokenPrefix(token: string, length = 12): string {
  return token.slice(0, length);
}

function resolveInviteTokenSecret(): string {
  const secret =
    process.env.EVENTS_INVITE_TOKEN_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error('Missing invite token secret');
  }

  return secret;
}

export function deriveInviteToken(inviteId: string): string {
  const secret = resolveInviteTokenSecret();
  return createHmac('sha256', secret).update(inviteId).digest('base64url');
}
