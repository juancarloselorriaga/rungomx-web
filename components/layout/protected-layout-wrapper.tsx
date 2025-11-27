import NavigationBar from './navigation/nav-bar';
import { protectedNavItems, protectedNavSections } from './navigation/protected-nav-items.constants';
import { Sidebar } from './navigation/sidebar';

export default function ProtectedLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <NavigationBar items={protectedNavItems} variant="protected"/>
      <div className="flex">
        <Sidebar sections={protectedNavSections}/>
        <div className="flex-1 min-w-0">
          <main className="px-4 pb-10 pt-6 md:px-8 lg:px-10">
            <div className="mx-auto w-full max-w-6xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
