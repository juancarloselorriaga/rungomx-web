import type { EntitlementEvaluationResult } from './types';
import { getProEntitlementForUser } from './entitlements';

export class ProAccessError extends Error {
  readonly code = 'PRO_REQUIRED';

  constructor(message = 'Pro access required') {
    super(message);
  }
}

export async function requireProEntitlement({
  userId,
  isInternal,
  now = new Date(),
}: {
  userId: string;
  isInternal: boolean;
  now?: Date;
}): Promise<EntitlementEvaluationResult> {
  const result = await getProEntitlementForUser({ userId, isInternal, now });
  if (!result.isPro) {
    throw new ProAccessError();
  }
  return result;
}
