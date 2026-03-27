import NavigationBar from '@/components/layout/navigation/nav-bar';
import {
  MobileNavPushLayout,
  NavDrawerProvider,
} from '@/components/layout/navigation/nav-drawer-context';
import { SlidingNavProvider } from '@/components/layout/navigation/sliding-nav-context';
import { SlidingSidebar } from '@/components/layout/navigation/sliding-sidebar';
import ProtectedLayoutWrapper from '@/components/layout/protected-layout-wrapper';
import { AutoClaimPendingGrantsClient } from '@/components/billing/auto-claim-pending-grants-client';
import { getProtectedLayoutContext } from '@/lib/auth/protected-layout-context';
import { notFound } from 'next/navigation';
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

  const ctx = await getProtectedLayoutContext(locale);

  return (
    <ProtectedLayoutWrapper
      initialPreferredLocale={ctx.initialPreferredLocale}
      initialProFeaturesSnapshot={ctx.proFeaturesSnapshot}
    >
      <AutoClaimPendingGrantsClient enabled={ctx.shouldAutoClaimGrants} />
      <SlidingNavProvider>
        <NavDrawerProvider>
          <MobileNavPushLayout className="min-h-screen bg-background">
            <NavigationBar items={ctx.navItems} variant="protected" isPro={ctx.isProMembership} />
            <div className="flex">
              <SlidingSidebar sections={ctx.navSections} isPro={ctx.isProMembership} />
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
