export type MyRegistrationStatusKey =
  | 'confirmed'
  | 'payment_pending'
  | 'cancelled'
  | 'started'
  | 'submitted'
  | 'expired';

type NormalizeMyRegistrationStatusInput = {
  status: string;
  expiresAt: Date | null;
  now: Date;
};

export function normalizeMyRegistrationStatus({
  status,
  expiresAt,
  now,
}: NormalizeMyRegistrationStatusInput): MyRegistrationStatusKey {
  if (
    (status === 'started' || status === 'submitted') &&
    expiresAt !== null &&
    expiresAt.getTime() <= now.getTime()
  ) {
    return 'expired';
  }

  if (
    status === 'confirmed' ||
    status === 'payment_pending' ||
    status === 'cancelled' ||
    status === 'started' ||
    status === 'submitted'
  ) {
    return status;
  }

  return 'expired';
}
