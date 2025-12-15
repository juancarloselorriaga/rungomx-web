'use client';

import AuthControlsCompact from '@/components/auth/auth-controls-compact';
import { LanguageSwitcher } from '@/components/language-switcher';
import { FeedbackDialog } from '@/components/layout/navigation/feedback-dialog';
import { NavItems } from '@/components/layout/navigation/nav-items';
import type { NavigationDrawerContentProps } from '@/components/layout/navigation/types';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Link, usePathname } from '@/i18n/navigation';
import { useSession } from '@/lib/auth/client';
import { Megaphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useMemo } from 'react';
import { useNavDrawer } from './nav-drawer-context';

export function NavigationDrawerContent({
  user: initialUser,
  items,
}: NavigationDrawerContentProps) {
  const pathname = usePathname();
  const t = useTranslations('common');
  const navigationTranslations = useTranslations('navigation');
  const { data } = useSession();
  const { open, setOpen } = useNavDrawer();

  const resolvedUser = useMemo(() => data?.user ?? initialUser ?? null, [data?.user, initialUser]);

  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <SheetContent side="left" hideCloseButton hideOverlay className="p-0">
      <div
        className="flex h-full flex-col px-0 py-0 opacity-0 transition-opacity duration-150 ease-out group-data-[state=open]/sheet:opacity-100"
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
          <NavItems linkClassName="w-full" items={items} />
        </nav>

        <div className="mt-auto border-t p-4 space-y-4">
          <FeedbackDialog
            collapsed={false}
            label={navigationTranslations('feedback')}
            icon={Megaphone}
          />
          <div className="flex w-full items-center justify-between">
            <AuthControlsCompact initialUser={resolvedUser} />
            <div className="flex items-center gap-2">
              <Suspense fallback={null}>
                <LanguageSwitcher />
              </Suspense>
              <Suspense fallback={null}>
                <ThemeSwitcher />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </SheetContent>
  );
}
