import {
  buildProtectedNavItems,
  buildProtectedNavSections,
} from '@/components/layout/navigation/protected-nav-items.constants';
import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getProEntitlementForUser } from '@/lib/billing/entitlements';
import { getProFeatureConfigSnapshot } from '@/lib/pro-features/server/config';
import type { ProFeaturesSnapshot } from '@/app/actions/pro-features';
import { redirect } from 'next/navigation';

/**
 * Shared context resolver for protected layouts.
 *
 * Handles auth, permissions, billing and nav-building logic that is common to
 * both the sidebar-enabled `(protected)` layout and the sidebar-free
 * `(protected-fullscreen)` layout.
 *
 * Redirects to `/sign-in` if unauthenticated or `/admin` if the user lacks
 * protected-area access.
 */
export async function getProtectedLayoutContext(locale: 'es' | 'en') {
  const authContext = await getAuthContext();

  if (!authContext.session) {
    redirect(
      getPathname({
        href: '/sign-in',
        locale,
      }),
    );
  }

  const shouldAutoClaimGrants = Boolean(
    authContext.user?.emailVerified && authContext.user.email && !authContext.isInternal,
  );

  // Redirect non-user-area users to admin, EXCEPT internal staff with events management permissions
  // (they need access to organizer shell for support per Phase 0 plan)
  const canAccessProtectedArea =
    authContext.permissions.canAccessUserArea ||
    (authContext.isInternal && authContext.permissions.canManageEvents);

  if (!canAccessProtectedArea) {
    redirect(
      getPathname({
        href: '/admin',
        locale,
      }),
    );
  }

  // Build nav items based on user permissions
  const navSections = buildProtectedNavSections(authContext.permissions);
  const navItems = buildProtectedNavItems(authContext.permissions);

  let isProMembership = false;
  if (authContext.user && !authContext.isInternal) {
    try {
      const entitlement = await getProEntitlementForUser({
        userId: authContext.user.id,
        isInternal: authContext.isInternal,
      });
      isProMembership = entitlement.isPro;
    } catch (error) {
      console.warn('[billing] Failed to resolve pro entitlement for nav', error);
      isProMembership = false;
    }
  }

  let proFeaturesSnapshot: ProFeaturesSnapshot | undefined;
  try {
    const configs = await getProFeatureConfigSnapshot();
    proFeaturesSnapshot = {
      isInternal: authContext.isInternal,
      isProMembership,
      configs,
    };
  } catch (error) {
    console.warn('[pro-features] Failed to resolve initial snapshot', error);
  }

  return {
    authContext,
    shouldAutoClaimGrants,
    isProMembership,
    proFeaturesSnapshot,
    navSections,
    navItems,
    initialPreferredLocale: authContext.profile?.locale ?? null,
  };
}
