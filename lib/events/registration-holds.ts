export const STARTED_TTL_MINUTES = Number(process.env.EVENTS_REGISTRATION_STARTED_TTL_MINUTES ?? '30');
export const SUBMITTED_TTL_MINUTES = Number(process.env.EVENTS_REGISTRATION_SUBMITTED_TTL_MINUTES ?? '30');
export const PAYMENT_PENDING_TTL_HOURS = Number(process.env.EVENTS_REGISTRATION_PAYMENT_PENDING_TTL_HOURS ?? '24');

const resolveTtl = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

const STARTED_TTL_MINUTES_RESOLVED = resolveTtl(STARTED_TTL_MINUTES, 30);
const SUBMITTED_TTL_MINUTES_RESOLVED = resolveTtl(SUBMITTED_TTL_MINUTES, 30);
const PAYMENT_PENDING_TTL_HOURS_RESOLVED = resolveTtl(PAYMENT_PENDING_TTL_HOURS, 24);

export function computeExpiresAt(
  now: Date,
  status: 'started' | 'submitted' | 'payment_pending',
): Date {
  switch (status) {
    case 'started':
      return new Date(now.getTime() + STARTED_TTL_MINUTES_RESOLVED * 60 * 1000);
    case 'submitted':
      return new Date(now.getTime() + SUBMITTED_TTL_MINUTES_RESOLVED * 60 * 1000);
    case 'payment_pending':
      return new Date(now.getTime() + PAYMENT_PENDING_TTL_HOURS_RESOLVED * 60 * 60 * 1000);
  }
}

export function isExpiredHold(status: string, expiresAt: Date | null, now: Date): boolean {
  if (status === 'cancelled') {
    return true;
  }

  if (status === 'confirmed') {
    return false;
  }

  if (status === 'started' || status === 'submitted' || status === 'payment_pending') {
    return expiresAt === null || expiresAt <= now;
  }

  return true;
}

