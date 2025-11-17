import NavigationBar from './navigation/nav-bar';
import Footer from './footer';
import { publicNavItems } from './navigation/public-nav-items.constants';

export default function PublicLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <NavigationBar items={publicNavItems} variant="public" />
      <main className="flex-1 w-full max-w-7xl mx-auto p-5 pt-20">
        {children}
      </main>
      <Footer />
    </div>
  );
}
