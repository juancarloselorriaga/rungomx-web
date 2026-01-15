'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Calendar,
  FileText,
  LayoutDashboard,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  User,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FeedbackDialog } from './feedback-dialog';
import { navActionContainer, NavActionContent } from './nav-action';
import { NavLink } from './nav-link';
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

interface SidebarProps {
  items?: readonly NavItem<ProtectedNavIconName>[];
  sections?: readonly NavSection<ProtectedNavIconName>[];
}

export function Sidebar({ items, sections }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const t = useTranslations('navigation');
  const resolvedSections: readonly NavSection<ProtectedNavIconName>[] =
    sections ?? (items ? [{ items }] : []);
  const allItemHrefs = resolvedSections.flatMap((section) =>
    section.items.map((item) =>
      typeof item.href === 'string' ? item.href : (item.href.pathname ?? '/'),
    ),
  );

  if (resolvedSections.length === 0) return null;

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:sticky md:top-16 md:flex h-[calc(100vh-4rem-1px)] flex-col border-r bg-background-surface transition-[width] duration-300 ease-in-out',
          collapsed ? 'w-16' : 'w-64',
        )}
        data-collapsed={collapsed}
      >
        {/* Navigation Items */}
        <nav className="flex-1 overflow-hidden px-2 py-3 space-y-4">
          {resolvedSections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="space-y-1">
              {section.titleKey ? (
                <div
                  className={cn(
                    'flex items-center justify-start h-6',
                    collapsed ? 'max-w-0 opacity-0 hidden' : 'max-full opacity-100',
                  )}
                >
                  <p
                    className={cn(
                      'px-3 text-[0.75rem] font-semibold uppercase text-muted-foreground tracking-wide transition-[opacity,max-width] duration-300',
                    )}
                  >
                    {t(section.titleKey)}
                  </p>
                </div>
              ) : null}
              <div
                className={cn(
                  'flex items-center justify-start h-6',
                  !collapsed ? 'opacity-0 hidden' : 'opacity-100 max-w-[50px]',
                )}
              >
                <div className={cn('h-[3px] w-[80%] mx-auto bg-muted rounded-full')} />
              </div>

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
                    collapsed={collapsed}
                    allowPrefixMatch={!hasChild}
                  />
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto border-t px-2 py-3 space-y-1">
          <FeedbackDialog
            collapsed={collapsed}
            label={t('feedback')}
            icon={Megaphone}
            iconSize={ICON_SIZE}
          />
          <Button
            variant="ghost"
            className={cn(
              navActionContainer(),
              'w-full flex justify-start text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t('expandMenu') : t('collapseMenu')}
            data-collapsed={collapsed}
            type="button"
          >
            <NavActionContent
              icon={collapsed ? PanelLeftOpen : PanelLeftClose}
              label={t('collapseMenu')}
              iconSize={ICON_SIZE}
              collapsed={collapsed}
            />
          </Button>
        </div>
      </aside>
    </>
  );
}
