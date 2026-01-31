'use server';

import type { FormActionResult } from '@/lib/forms';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { getProEntitlementForUser } from '@/lib/billing/entitlements';
import { getProFeatureConfigSnapshot } from '@/lib/pro-features/server/config';
import type { ProFeatureKey } from '@/lib/pro-features/catalog';
import type { ResolvedProFeatureConfig } from '@/lib/pro-features/types';

export type ProFeaturesSnapshot = {
  isInternal: boolean;
  isProMembership: boolean;
  configs: Record<ProFeatureKey, ResolvedProFeatureConfig<ProFeatureKey>>;
};

export const getProFeaturesSnapshotAction = withAuthenticatedUser<FormActionResult<ProFeaturesSnapshot>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
})(async (authContext) => {
  try {
    const [configs, entitlement] = await Promise.all([
      getProFeatureConfigSnapshot(),
      authContext.isInternal
        ? Promise.resolve({ isPro: false })
        : getProEntitlementForUser({ userId: authContext.user.id, isInternal: authContext.isInternal }),
    ]);

    return {
      ok: true,
      data: {
        isInternal: authContext.isInternal,
        isProMembership: entitlement.isPro ?? false,
        configs,
      },
    };
  } catch (error) {
    console.error('[pro-features] Failed to load snapshot', error);
    return { ok: false, error: 'SERVER_ERROR', message: 'SERVER_ERROR' };
  }
});
