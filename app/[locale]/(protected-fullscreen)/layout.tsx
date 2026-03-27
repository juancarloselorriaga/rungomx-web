import NavigationBar from '@/components/layout/navigation/nav-bar';
import {
  MobileNavPushLayout,
  NavDrawerProvider,
} from '@/components/layout/navigation/nav-drawer-context';
import ProtectedLayoutWrapper from '@/components/layout/protected-layout-wrapper';
import { AutoClaimPendingGrantsClient } from '@/components/billing/auto-claim-pending-grants-client';
import { getProtectedLayoutContext } from '@/lib/auth/protected-layout-context';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';

type ProtectedFullscreenLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

const isSupportedLocale = (value: string): value is 'es' | 'en' =>
  value === 'es' || value === 'en';

/**
 * Sidebar-free protected layout for focused, full-width flows
 * (event creation, wizard, etc.).
 *
 * Shares auth, permissions, billing and provider logic with `(protected)` via
 * `getProtectedLayoutContext`. The top bar renders logo + user menu only.
 */
export default async function ProtectedFullscreenLayout({
  children,
  params,
}: ProtectedFullscreenLayoutProps) {
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
      <NavDrawerProvider>
        <MobileNavPushLayout className="min-h-screen bg-background">
          <NavigationBar items={[]} variant="protected" isPro={ctx.isProMembership} />
          <main className="px-4 pb-10 pt-6 md:px-8 lg:px-10">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </MobileNavPushLayout>
      </NavDrawerProvider>
    </ProtectedLayoutWrapper>
  );
}
