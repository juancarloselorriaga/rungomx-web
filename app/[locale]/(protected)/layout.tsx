import NavigationBar from '@/components/layout/navigation/nav-bar';
import {
  MobileNavPushLayout,
  NavDrawerProvider,
} from '@/components/layout/navigation/nav-drawer-context';
import {
  buildProtectedNavItems,
  buildProtectedNavSections,
} from '@/components/layout/navigation/protected-nav-items.constants';
import { SlidingNavProvider } from '@/components/layout/navigation/sliding-nav-context';
import { SlidingSidebar } from '@/components/layout/navigation/sliding-sidebar';
import ProtectedLayoutWrapper from '@/components/layout/protected-layout-wrapper';
import { AutoClaimPendingGrantsClient } from '@/components/billing/auto-claim-pending-grants-client';
import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getProEntitlementForUser } from '@/lib/billing/entitlements';
import { getProFeatureConfigSnapshot } from '@/lib/pro-features/server/config';
import type { ProFeaturesSnapshot } from '@/app/actions/pro-features';
import { notFound, redirect } from 'next/navigation';
import { ReactNode } from 'react';

type ProtectedLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

const isSupportedLocale = (value: string): value is 'es' | 'en' =>
  value === 'es' || value === 'en';

export default async function ProtectedLayout({ children, params }: ProtectedLayoutProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
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

  return (
    <ProtectedLayoutWrapper
      initialPreferredLocale={authContext.profile?.locale ?? null}
      initialProFeaturesSnapshot={proFeaturesSnapshot}
    >
      <AutoClaimPendingGrantsClient enabled={shouldAutoClaimGrants} />
      <SlidingNavProvider>
        <NavDrawerProvider>
          <MobileNavPushLayout className="min-h-screen bg-background">
            <NavigationBar items={navItems} variant="protected" isPro={isProMembership} />
            <div className="flex">
              <SlidingSidebar sections={navSections} isPro={isProMembership} />
              <div className="flex-1 min-w-0">
                <main className="px-4 pb-10 pt-6 md:px-8 lg:px-10">
                  <div className="mx-auto w-full max-w-6xl">{children}</div>
                </main>
              </div>
            </div>
          </MobileNavPushLayout>
        </NavDrawerProvider>
      </SlidingNavProvider>
    </ProtectedLayoutWrapper>
  );
}
