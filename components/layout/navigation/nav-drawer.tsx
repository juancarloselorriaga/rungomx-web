'use client';

import AuthControlsCompact from '@/components/auth/auth-controls-compact';
import { LanguageSwitcher } from '@/components/language-switcher';
import { FeedbackDialog } from '@/components/layout/navigation/feedback-dialog';
import { NavItems } from '@/components/layout/navigation/nav-items';
import type { NavigationDrawerContentProps } from '@/components/layout/navigation/types';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Link, usePathname } from '@/i18n/navigation';
import { getProEntitlementAction } from '@/app/actions/billing';
import { useSession } from '@/lib/auth/client';
import { Crown, Megaphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useNavDrawer } from './nav-drawer-context';
import { SidebarBackHeader } from './sidebar-back-header';
import { useSlidingNavOptional } from './sliding-nav-context';
import { SubmenuNavigation } from './submenu-navigation';

export function NavigationDrawerContent({
  user: initialUser,
  isPro: initialIsPro,
  items,
}: NavigationDrawerContentProps) {
  const pathname = usePathname();
  const t = useTranslations('common');
  const tBilling = useTranslations('common.billing');
  const navigationTranslations = useTranslations('navigation');
  const { data } = useSession();
  const { open, setOpen } = useNavDrawer();
  const slidingNav = useSlidingNavOptional();

  const resolvedUser = useMemo(() => data?.user ?? initialUser ?? null, [data?.user, initialUser]);
  const resolvedUserId = resolvedUser?.id;
  const [fetchedIsPro, setFetchedIsPro] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    if (initialIsPro !== undefined) return;
    if (!resolvedUserId) return;

    (async () => {
      const result = await getProEntitlementAction();
      if (cancelled) return;
      setFetchedIsPro(result.ok ? result.data.isPro : false);
    })();

    return () => {
      cancelled = true;
    };
  }, [initialIsPro, resolvedUserId]);

  const resolvedIsPro = initialIsPro !== undefined ? initialIsPro : fetchedIsPro;

  // Get sliding nav state (falls back to 'root' if no context)
  const displayLevel = slidingNav?.displayLevel ?? 'root';
  const submenuContext = slidingNav?.submenuContext ?? null;
  const detectedSubmenuId = slidingNav?.detectedSubmenuId ?? null;
  const goToRoot = slidingNav?.goToRoot ?? (() => {});

  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <SheetContent
      side="left"
      hideCloseButton
      className="max-w-[23rem] border-r-0 bg-transparent p-3 shadow-none"
    >
      <div
        className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-border/50 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] opacity-0 shadow-[0_28px_90px_-60px_rgba(15,23,42,0.5)] transition-opacity duration-150 ease-out group-data-[state=open]/sheet:opacity-100"
        data-open={open ? 'true' : 'false'}
      >
        <SheetHeader className="flex-shrink-0 border-b border-border/55 px-5 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle asChild>
              <Link className="font-display text-[1.1rem] font-medium tracking-[-0.03em]" href="/">
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
                <NavItems
                  items={items}
                  containerClassName="space-y-2 p-5"
                  itemClassName="contents"
                  linkClassName="w-full rounded-[1rem] border border-transparent px-4 py-3"
                  activeClassName="rounded-[1rem] border border-border/40 bg-foreground text-background shadow-sm hover:text-background"
                  inactiveClassName="rounded-[1rem] border border-transparent text-muted-foreground hover:border-border/40 hover:bg-background/70 hover:text-foreground"
                  showIndicator={false}
                />
              </nav>

              <div className="sliding-nav-panel-footer px-5 pb-5 pt-2">
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
                    metaBadge={submenuContext.metaBadge}
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
        <div className="flex-shrink-0 space-y-4 border-t border-border/55 px-5 py-4">
          {resolvedUser && resolvedIsPro ? (
            <div className="flex items-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-gold/15 px-3 py-1 text-xs font-semibold text-brand-gold-dark dark:text-brand-gold">
                <Crown className="size-4" />
                <span>{tBilling('proMember')}</span>
              </div>
            </div>
          ) : null}
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
