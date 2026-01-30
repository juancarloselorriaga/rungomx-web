import { claimPendingEntitlementGrantsForUser } from './commands';

export async function maybeAutoClaimPendingGrants({
  userId,
  email,
  emailVerified,
}: {
  userId: string;
  email: string | null | undefined;
  emailVerified: boolean;
}) {
  if (!emailVerified || !email) return;

  try {
    await claimPendingEntitlementGrantsForUser({
      userId,
      email,
      claimSource: 'auto_on_verified_session',
    });
  } catch (error) {
    console.error('[billing] Failed to auto-claim pending grants', error);
  }
}
