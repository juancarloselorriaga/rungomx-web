import { NavDrawerTrigger } from '@/components/layout/navigation/nav-drawer-trigger';
import { NavItems } from '@/components/layout/navigation/nav-items';
import type { NavItem } from '@/components/layout/navigation/types';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AuthCtaWithSession } from './auth-cta-with-session';
import { UserMenuWithSession } from './user-menu-with-session';

interface PublicNavigationBarProps {
  items: readonly NavItem[];
}

export default async function PublicNavigationBar({ items }: PublicNavigationBarProps) {
  const t = await getTranslations('common');
  const showNavItems = items.length > 0;

  return (
    <nav className="sticky top-0 z-30 w-full px-3 py-3 backdrop-blur md:px-4">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 rounded-[1.4rem] border border-border/50 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] px-3 py-2 shadow-[0_24px_70px_-56px_rgba(15,23,42,0.4)] md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {items.length > 0 ? <NavDrawerTrigger items={items} /> : null}
          <Link
            className="font-display text-[1.05rem] font-medium tracking-[-0.03em] text-foreground sm:text-[1.15rem]"
            href="/"
          >
            {t('brandName')}
          </Link>
        </div>

        {showNavItems ? (
          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:flex">
            <NavItems
              items={items}
              containerClassName="pointer-events-auto flex-row items-center justify-center gap-1 rounded-full border border-border/45 bg-background/80 p-1 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.32)]"
              itemClassName="contents"
              linkClassName="rounded-full px-4 py-2.5"
              activeClassName="rounded-full bg-foreground text-background shadow-sm hover:text-background"
              inactiveClassName="rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
              iconSize={16}
              showIcons={false}
              showLabels
              showIndicator={false}
            />
          </div>
        ) : null}

        <div className="flex-1" />

        <div className="flex items-center justify-end gap-2">
          <AuthCtaWithSession />
          <Suspense fallback={null}>
            <UserMenuWithSession />
          </Suspense>
        </div>
      </div>
    </nav>
  );
}
