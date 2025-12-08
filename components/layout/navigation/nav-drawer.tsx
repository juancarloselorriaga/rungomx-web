'use client';

import AuthControlsCompact from '@/components/auth/auth-controls-compact';
import { LanguageSwitcher } from '@/components/language-switcher';
import { NavItems } from '@/components/layout/navigation/nav-items';
import type { NavigationDrawerContentProps } from '@/components/layout/navigation/types';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Link, usePathname } from '@/i18n/navigation';
import { useSession } from '@/lib/auth/client';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useNavDrawer } from './nav-drawer-context';

export function NavigationDrawerContent({
  user: initialUser,
  items,
}: NavigationDrawerContentProps) {
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const t = useTranslations('common');
  const { data } = useSession();
  const { open } = useNavDrawer();

  const resolvedUser = useMemo(
    () => data?.user ?? initialUser ?? null,
    [data?.user, initialUser],
  );

  useEffect(() => {
    if (closeButtonRef.current) {
      closeButtonRef.current.click();
    }
  }, [pathname]);

  return (
    <SheetContent
      side="left"
      hideCloseButton
      className="p-0"
    >
      <div
        className="flex h-full flex-col origin-top px-0 py-0 opacity-0 scale-[0.97] translate-x-[-4px] translate-y-2 transform-gpu transition-[opacity,transform] duration-[275ms] ease-[cubic-bezier(0.2,0.7,0.25,1)] delay-[75ms] group-data-[state=closed]/sheet:delay-0 group-data-[state=open]/sheet:opacity-100 group-data-[state=open]/sheet:scale-100 group-data-[state=open]/sheet:translate-x-0 group-data-[state=open]/sheet:translate-y-0"
        data-open={open ? 'true' : 'false'}
      >
        <SheetHeader className="p-1 py-2 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle asChild>
              <Link className="px-4" href="/">
                {t('brandName')}
              </Link>
            </SheetTitle>
          </div>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto">
          <NavItems linkClassName="w-full" items={items}/>
        </nav>

        <div className="mt-auto border-t p-4">
          <div className="flex w-full items-center justify-between">
            <AuthControlsCompact initialUser={resolvedUser}/>
            <div className="flex items-center gap-2">
              <Suspense fallback={null}>
                <LanguageSwitcher/>
              </Suspense>
              <Suspense fallback={null}>
                <ThemeSwitcher/>
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </SheetContent>
  );
}
