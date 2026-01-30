import NavigationBar from '@/components/layout/navigation/nav-bar';
import type { PermissionSet } from '@/lib/auth/roles';
import { type ReactNode } from 'react';
import { buildAdminNavItems, buildAdminNavSections } from './navigation/admin-nav-items.constants';
import { MobileNavPushLayout, NavDrawerProvider } from './navigation/nav-drawer-context';
import { SlidingNavProvider } from './navigation/sliding-nav-context';
import { SlidingSidebar } from './navigation/sliding-sidebar';

type AdminLayoutWrapperProps = {
  children: ReactNode;
  permissions: PermissionSet;
};

export default function AdminLayoutWrapper({ children, permissions }: AdminLayoutWrapperProps) {
  const navSections = buildAdminNavSections(permissions);
  const navItems = buildAdminNavItems(permissions);

  return (
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
  );
}
