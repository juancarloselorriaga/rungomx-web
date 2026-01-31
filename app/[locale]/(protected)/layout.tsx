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
import { AppLocale } from '@/i18n/routing';
import { getAuthContext } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

type ProtectedLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: AppLocale }>;
};

export default async function ProtectedLayout({ children, params }: ProtectedLayoutProps) {
  const { locale } = await params;
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

  return (
    <ProtectedLayoutWrapper>
      <AutoClaimPendingGrantsClient enabled={shouldAutoClaimGrants} />
      <SlidingNavProvider>
        <NavDrawerProvider>
          <MobileNavPushLayout className="min-h-screen bg-background">
            <NavigationBar items={navItems} variant="protected" />
            <div className="flex">
              <SlidingSidebar sections={navSections} />
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
