import NavigationBar from '@/components/layout/navigation/nav-bar';
import {
  MobileNavPushLayout,
  NavDrawerProvider,
} from '@/components/layout/navigation/nav-drawer-context';
import {
  protectedNavItems,
  protectedNavSections,
} from '@/components/layout/navigation/protected-nav-items.constants';
import { Sidebar } from '@/components/layout/navigation/sidebar';
import ProtectedLayoutWrapper from '@/components/layout/protected-layout-wrapper';
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

  if (!authContext.permissions.canAccessUserArea || authContext.isInternal) {
    redirect(
      getPathname({
        href: '/admin',
        locale,
      }),
    );
  }

  return (
    <ProtectedLayoutWrapper>
      <NavDrawerProvider>
        <MobileNavPushLayout className="min-h-screen bg-background">
          <NavigationBar items={protectedNavItems} variant="protected" />
          <div className="flex">
            <Sidebar sections={protectedNavSections} />
            <div className="flex-1 min-w-0">
              <main className="px-4 pb-10 pt-6 md:px-8 lg:px-10">
                <div className="mx-auto w-full max-w-6xl">{children}</div>
              </main>
            </div>
          </div>
        </MobileNavPushLayout>
      </NavDrawerProvider>
    </ProtectedLayoutWrapper>
  );
}
