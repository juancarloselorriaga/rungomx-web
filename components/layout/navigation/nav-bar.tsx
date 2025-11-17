import { AuthControls } from '@/components/auth/auth-controls';
import {
  NavigationBar as NavigationBarClient
} from '@/components/layout/navigation/nav-bar.client';
import { NavItems } from '@/components/layout/navigation/nav-items';
import type { NavItem } from '@/components/layout/navigation/types';
import { ThemeSwitcher } from '@/components/theme-switcher.client';
import { getCurrentUser } from '@/lib/auth';
import { cacheLife } from 'next/cache';
import Link from 'next/link';
import { Suspense } from 'react';

interface NavigationBarProps {
  items: readonly NavItem[];
  variant?: 'public' | 'protected';
}

export default async function NavigationBar({
  items,
  variant = 'public'
}: NavigationBarProps) {
  'use cache';
  cacheLife('minutes');

  const user = await getCurrentUser();

  return (
    <nav
      className="bg-gradient-to-t from-transparent via-background/80 to-background z-20 fixed top-0 right-0 left-0 w-full h-16">
      <div
        className="h-full w-full max-w-7xl mx-auto flex justify-between items-center p-3 text-sm ">
        <div className="flex items-center gap-3 font-semibold flex-1/3">
          <NavigationBarClient user={user} items={items}/>
          <Link className="hidden md:block px-4" href="/">
            SprintMX
          </Link>
        </div>

        <div className="hidden md:block mx-4 flex-1/3">
          <NavItems
            items={items}
            containerClassName="flex-row items-center justify-center space-y-0 space-x-2 p-0"
            iconSize={22}
            showLabels={true}
          />
        </div>

        <div className="hidden md:flex gap-2 items-center justify-end flex-1/3">
          <AuthControls/>
          <Suspense fallback={null}>
            <ThemeSwitcher/>
          </Suspense>
        </div>
      </div>
    </nav>
  );
}
