import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { registrations } from '@/db/schema';

export type RegistrationOwnershipErrorCode = 'NOT_FOUND' | 'FORBIDDEN';

export class RegistrationOwnershipError extends Error {
  public readonly code: RegistrationOwnershipErrorCode;

  constructor(code: RegistrationOwnershipErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type RegistrationWith = NonNullable<
  Parameters<typeof db.query.registrations.findFirst>[0]
>['with'];

export async function getRegistrationForOwnerOrThrow<
  TWith extends RegistrationWith | undefined = undefined,
>(params: {
  registrationId: string;
  userId: string;
  with?: TWith;
}) {
  const registration = await db.query.registrations.findFirst({
    where: and(eq(registrations.id, params.registrationId), isNull(registrations.deletedAt)),
    with: params.with,
  });

  if (!registration) {
    throw new RegistrationOwnershipError('NOT_FOUND', 'Registration not found');
  }

  if (registration.buyerUserId !== params.userId) {
    throw new RegistrationOwnershipError('FORBIDDEN', 'Permission denied');
  }

  return registration;
}
