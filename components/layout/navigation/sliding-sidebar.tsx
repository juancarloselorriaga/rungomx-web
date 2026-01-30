'use client';

import { getProEntitlementAction } from '@/app/actions/billing';
import {
  Calendar,
  Crown,
  FileText,
  LayoutDashboard,
  Megaphone,
  Settings,
  User,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FeedbackDialog } from './feedback-dialog';
import { NavLink } from './nav-link';
import { SidebarBackHeader } from './sidebar-back-header';
import { useSlidingNav } from './sliding-nav-context';
import { SubmenuNavigation } from './submenu-navigation';
import type { NavItem, NavSection, ProtectedNavIconName } from './types';

const ICON_SIZE = 20;

// Icon map for protected nav items
const iconMap = {
  LayoutDashboard,
  Settings,
  User,
  FileText,
  Users,
  Calendar,
} as const satisfies Record<ProtectedNavIconName, typeof LayoutDashboard>;

interface SlidingSidebarProps {
  items?: readonly NavItem<ProtectedNavIconName>[];
  sections?: readonly NavSection<ProtectedNavIconName>[];
  isPro?: boolean;
}

/**
 * SlidingSidebar is a 2-level sliding navigation component.
 * - Panel 1 (root): Main navigation items (Dashboard, Events, etc.)
 * - Panel 2 (submenu): Detail navigation (e.g., event detail sections)
 *
 * Features:
 * - URL-based auto-detection of active submenu
 * - Back button returns to root menu without navigation
 * - Chevrons on items with submenus for re-entry
 * - Smooth CSS animations
 * - Fixed 256px width (no collapse)
 */
export function SlidingSidebar({ items, sections, isPro }: SlidingSidebarProps) {
  const t = useTranslations('navigation');
  const tBilling = useTranslations('common.billing');
  const { displayLevel, detectedSubmenuId, submenuContext, goToRoot } = useSlidingNav();
  const [fetchedIsPro, setFetchedIsPro] = useState<boolean | undefined>(undefined);
  const resolvedIsPro = isPro !== undefined ? isPro : fetchedIsPro;

  const resolvedSections: readonly NavSection<ProtectedNavIconName>[] =
    sections ?? (items ? [{ items }] : []);

  const allItemHrefs = resolvedSections.flatMap((section) =>
    section.items.map((item) =>
      typeof item.href === 'string' ? item.href : (item.href.pathname ?? '/'),
    ),
  );

  useEffect(() => {
    let cancelled = false;

    if (isPro !== undefined) return;

    (async () => {
      const result = await getProEntitlementAction();
      if (cancelled) return;
      setFetchedIsPro(result.ok ? result.data.isPro : false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isPro]);

  if (resolvedSections.length === 0) return null;

  return (
    <aside className="hidden md:sticky md:top-16 md:flex h-[calc(100vh-4rem-1px)] w-64 flex-col border-r bg-background-surface overflow-hidden">
      <div
        className="sliding-nav-track h-full"
        data-level={displayLevel}
      >
        {/* Root Panel */}
        <div className="sliding-nav-panel">
          <nav className="sliding-nav-panel-nav px-2 py-3 space-y-4">
            {resolvedSections.map((section, sectionIndex) => (
              <div key={sectionIndex} className="space-y-1">
                {section.titleKey ? (
                  <div className="flex items-center justify-start h-6">
                    <p className="px-3 text-[0.75rem] font-semibold uppercase text-muted-foreground tracking-wide">
                      {t(section.titleKey)}
                    </p>
                  </div>
                ) : null}

                {section.items.map((item) => {
                  const Icon = iconMap[item.iconName];
                  const itemHref =
                    typeof item.href === 'string' ? item.href : (item.href.pathname ?? '/');
                  const label = t(item.labelKey);
                  const hasChild = allItemHrefs.some(
                    (href) => href !== itemHref && href.startsWith(`${itemHref}/`),
                  );

                  return (
                    <NavLink
                      key={itemHref}
                      href={item.href}
                      icon={Icon}
                      label={label}
                      iconSize={ICON_SIZE}
                      allowPrefixMatch={!hasChild}
                    />
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="sliding-nav-panel-footer px-2 py-3 space-y-1">
            {resolvedIsPro ? (
              <div className="flex items-center gap-3 rounded-lg px-3 py-2 bg-brand-gold/10 border border-brand-gold/25 text-brand-gold-dark dark:text-brand-gold">
                <Crown className="size-5 flex-shrink-0" />
                <span className="text-sm font-semibold">{tBilling('proMember')}</span>
              </div>
            ) : null}
            <FeedbackDialog
              collapsed={false}
              label={t('feedback')}
              icon={Megaphone}
              iconSize={ICON_SIZE}
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
              />
              <nav className="sliding-nav-panel-nav">
                <SubmenuNavigation
                  submenuId={detectedSubmenuId}
                  basePath={submenuContext.basePath}
                  footerLink={submenuContext.footerLink}
                  variant="sidebar"
                />
              </nav>
            </>
          ) : (
            // Render empty panel when no context to maintain layout
            <div className="flex-1" />
          )}
        </div>
      </div>
    </aside>
  );
}
