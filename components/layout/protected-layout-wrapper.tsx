import NavigationBar from './navigation/nav-bar';
import { Sidebar } from './navigation/sidebar';
import { protectedNavItems } from './navigation/protected-nav-items.constants';

export default function ProtectedLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={protectedNavItems} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <NavigationBar items={protectedNavItems} variant="protected" />
        <main className="flex-1 overflow-y-auto p-6 pt-20">
          {children}
        </main>
      </div>
    </div>
  );
}
