import { Suspense } from 'react';
import Footer from './footer';
import { MobileNavPushLayout, NavDrawerProvider } from './navigation/nav-drawer-context';
import PublicNavigationBar from './navigation/public-nav-bar';
import { publicNavItems } from './navigation/public-nav-items.constants';

export default function PublicLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <NavDrawerProvider>
      <MobileNavPushLayout className="flex flex-col min-h-screen">
        <PublicNavigationBar items={publicNavItems} />
        <main className="flex-1 w-full max-w-7xl mx-auto p-5">{children}</main>
        <Suspense>
          <Footer />
        </Suspense>
      </MobileNavPushLayout>
    </NavDrawerProvider>
  );
}
