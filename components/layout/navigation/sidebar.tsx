'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NavItem, ProtectedNavIconName } from './types';
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
  items: readonly NavItem<ProtectedNavIconName>[];
}

export function Sidebar({ items }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const t = useTranslations('navigation');

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r bg-background-surface transition-all duration-300',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Toggle Button */}
        <div className="flex items-center justify-end p-2 border-b h-16">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4"/>
            ) : (
              <ChevronLeft className="h-4 w-4"/>
            )}
          </Button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-2 space-y-1">
          {items.map((item) => {
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
        </nav>
      </aside>
    </>
  );
}
