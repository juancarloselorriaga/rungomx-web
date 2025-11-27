'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NavItem, NavSection, ProtectedNavIconName } from './types';
import { NavLink } from './nav-link';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Settings,
  User,
  Users
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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

export function Sidebar({ items, sections }: SidebarProps) {
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
          'hidden md:sticky md:top-16 md:flex h-[calc(100vh-4rem)] flex-col border-r bg-background-surface transition-[width] duration-300',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Toggle Button */}
        <div className={cn("flex items-center justify-end p-3 h-16", collapsed && "justify-center")}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4"/>
            ) : (
              <ChevronLeft className="h-4 w-4"/>
            )}
          </Button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-4 py-3 space-y-6">
          {resolvedSections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="space-y-1">
              {section.titleKey ? (
                <p
                  className={cn(
                    'px-3 pb-3 text-xs font-semibold uppercase text-muted-foreground tracking-wide',
                    collapsed && 'opacity-0'
                  )}
                >
                  {t(section.titleKey)}
                </p>
              ) : null }
              {collapsed ? <div className="h-[2px] mb-4 w-full bg-muted"/> : null}
              {section.items.map((item) => {
                const Icon = iconMap[item.iconName];
                const itemHref = typeof item.href === 'string' ? item.href : item.href.pathname ?? '/';
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
      </aside>
    </>
  );
}
