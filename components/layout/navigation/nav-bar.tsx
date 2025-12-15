import { NavDrawerTrigger } from '@/components/layout/navigation/nav-drawer-trigger';
import { NavItems } from '@/components/layout/navigation/nav-items';
import type { NavItem } from '@/components/layout/navigation/types';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { UserMenu } from './user-menu';

interface NavigationBarProps {
  items: readonly NavItem[];
  variant?: 'public' | 'protected';
}

export default async function NavigationBar({ items, variant = 'public' }: NavigationBarProps) {
  const user = await getCurrentUser();
  const t = await getTranslations('common');

  const showNavItems = items.length > 0;

  return (
    <nav className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur">
      <div className="flex h-16 w-full items-center gap-3 px-4 text-sm md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {items.length > 0 ? <NavDrawerTrigger user={user} items={items} /> : null}
          <Link className="font-semibold" href="/">
            {t('brandName')}
          </Link>
        </div>

        {showNavItems && variant === 'public' ? (
          <div className="hidden flex-1 items-center justify-center lg:flex">
            <NavItems
              items={items}
              containerClassName="flex-row items-center justify-center space-y-0 space-x-2 p-0"
              iconSize={20}
              showLabels
            />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex items-center justify-end gap-2">
          <Suspense fallback={null}>
            <UserMenu user={user} />
          </Suspense>
        </div>
      </div>
    </nav>
  );
}
