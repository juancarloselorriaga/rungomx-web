'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NavItem, NavSection, ProtectedNavIconName } from './types';
import { NavLink } from './nav-link';
import {
  FileText,
  LayoutDashboard,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  User,
  Users
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FeedbackDialog } from './feedback-dialog';

// Icon map for protected nav items
const iconMap = {
  LayoutDashboard,
  Settings,
  User,
  FileText,
  Users,
} as const satisfies Record<ProtectedNavIconName, (typeof LayoutDashboard)>;

interface SidebarProps {
  items?: readonly NavItem<ProtectedNavIconName>[];
  sections?: readonly NavSection<ProtectedNavIconName>[];
}

export function Sidebar({
  items,
  sections
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const t = useTranslations('navigation');
  const resolvedSections: readonly NavSection<ProtectedNavIconName>[] =
    sections ?? (items ? [{ items }] : []);

  if (resolvedSections.length === 0) return null;

  return (
    <>
      {/* Desktop Sidebar */}
        <aside
          className={cn(
            'hidden md:sticky md:top-16 md:flex h-[calc(100vh-4rem-1px)] flex-col border-r bg-background-surface transition-[width] duration-300 ease-in-out',
            collapsed ? 'w-16' : 'w-64'
          )}
          data-collapsed={collapsed}
        >
          {/* Navigation Items */}
          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
            {resolvedSections.map((section, sectionIndex) => (
              <div key={sectionIndex} className="space-y-1">
                {section.titleKey ? (
                  <div className={cn('flex items-center justify-start h-6',
                    collapsed ? 'max-w-0 opacity-0 hidden' : 'max-full opacity-100')}>
                    <p
                      className={cn(
                        'px-3 text-[0.75rem] font-semibold uppercase text-muted-foreground tracking-wide transition-[opacity,max-width] duration-300',
                      )}
                    >
                      {t(section.titleKey)}
                    </p>
                  </div>
                ) : null}
                <div className={cn('flex items-center justify-start h-6',
                  !collapsed ? 'opacity-0 hidden' : 'opacity-100 max-w-[50px]')}>
                  <div className={cn('h-[3px] w-[80%] mx-auto bg-muted rounded-full')}/>
                </div>

                {section.items.map((item) => {
                  const Icon = iconMap[item.iconName];
                  const itemHref = typeof item.href === 'string' ? item.href :
                    item.href.pathname ?? '/';
                  const label = t(item.labelKey);

                  return (
                    <NavLink
                      key={itemHref}
                      href={item.href}
                      icon={Icon}
                      label={label}
                      iconSize={20}
                      collapsed={collapsed}
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
            />
            <Button
              variant="ghost"
              className={cn(
                'w-full flex items-center gap-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-300',
                collapsed ? 'justify-center px-2 gap-2' : 'justify-start px-3'
              )}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? t('expandMenu') : t('collapseMenu')}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4"/>
              ) : (
                <PanelLeftClose className="h-4 w-4"/>
              )}
              <span
                className={cn(
                  'min-w-0 overflow-hidden whitespace-nowrap transition-[opacity,transform,max-width] duration-300 ease-in-out',
                  collapsed ? 'max-w-0 opacity-0' : 'max-w-[200px] opacity-100'
                )}
                style={{ transitionDelay: collapsed ? '0ms' : '120ms' }}
              >
              {collapsed ? t('expandMenu') : t('collapseMenu')}
            </span>
            </Button>
          </div>
        </aside>
    </>
  );
}
