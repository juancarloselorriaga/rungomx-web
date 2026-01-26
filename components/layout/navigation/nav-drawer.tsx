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
import { SidebarBackHeader } from './sidebar-back-header';
import { useSlidingNavOptional } from './sliding-nav-context';
import { SubmenuNavigation } from './submenu-navigation';

export function NavigationDrawerContent({
  user: initialUser,
  items,
}: NavigationDrawerContentProps) {
  const pathname = usePathname();
  const t = useTranslations('common');
  const navigationTranslations = useTranslations('navigation');
  const { data } = useSession();
  const { open, setOpen } = useNavDrawer();
  const slidingNav = useSlidingNavOptional();

  const resolvedUser = useMemo(() => data?.user ?? initialUser ?? null, [data?.user, initialUser]);

  // Get sliding nav state (falls back to 'root' if no context)
  const displayLevel = slidingNav?.displayLevel ?? 'root';
  const submenuContext = slidingNav?.submenuContext ?? null;
  const detectedSubmenuId = slidingNav?.detectedSubmenuId ?? null;
  const goToRoot = slidingNav?.goToRoot ?? (() => {});

  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <SheetContent side="left" hideCloseButton hideOverlay className="p-0">
      <div
        className="flex h-full flex-col px-0 py-0 opacity-0 transition-opacity duration-150 ease-out group-data-[state=open]/sheet:opacity-100 overflow-hidden"
        data-open={open ? 'true' : 'false'}
      >
        <SheetHeader className="p-1 py-2 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle asChild>
              <Link className="px-4" href="/">
                {t('brandName')}
              </Link>
            </SheetTitle>
          </div>
        </SheetHeader>

        {/* Sliding Navigation Track */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="sliding-nav-track h-full" data-level={displayLevel}>
            {/* Root Panel */}
            <div className="sliding-nav-panel">
              <nav className="sliding-nav-panel-nav">
                <NavItems linkClassName="w-full" items={items} />
              </nav>

              <div className="sliding-nav-panel-footer p-4">
                <FeedbackDialog
                  collapsed={false}
                  label={navigationTranslations('feedback')}
                  icon={Megaphone}
                />
              </div>
            </div>

            {/* Submenu Panel */}
            <div className="sliding-nav-panel">
              {submenuContext ? (
                <>
                  <SidebarBackHeader
                    title={submenuContext.title}
                    subtitle={submenuContext.subtitle}
                    onClick={goToRoot}
                    variant="drawer"
                  />
                  <nav className="sliding-nav-panel-nav">
                    <SubmenuNavigation
                      submenuId={detectedSubmenuId}
                      basePath={submenuContext.basePath}
                      footerLink={submenuContext.footerLink}
                      variant="drawer"
                    />
                  </nav>
                </>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          </div>
        </div>

        {/* Footer - always visible */}
        <div className="border-t p-4 space-y-4 flex-shrink-0">
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
