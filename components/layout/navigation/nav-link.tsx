'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { NavItem } from './types';

interface NavLinkProps {
  href: NavItem['href'];
  icon: LucideIcon;
  label: string;
  iconSize?: number;
  showLabel?: boolean;
  collapsed?: boolean;
  iconClassName?: string;
  linkClassName?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  indicatorClassName?: string;
  showIndicator?: boolean;
}

export function NavLink({
  href,
  icon: Icon,
  label,
  iconSize = 20,
  showLabel = true,
  collapsed = false,
  iconClassName,
  linkClassName,
  activeClassName = 'bg-primary/15 text-primary',
  inactiveClassName = 'text-muted-foreground hover:bg-accent hover:text-foreground',
  indicatorClassName,
  showIndicator = true,
}: NavLinkProps) {
  const pathname = usePathname();
  const itemHref = typeof href === 'string' ? href : href.pathname ?? '/';
  const isActive = pathname === itemHref || pathname.startsWith(`${itemHref}/`);

  return (
    <Link
      href={href}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
        isActive ? activeClassName : inactiveClassName,
        collapsed && 'justify-center',
        linkClassName
      )}
    >
      <Icon
        size={iconSize}
        className={cn(
          'flex-shrink-0 transition-colors group-hover:text-foreground',
          isActive && 'text-primary',
          iconClassName
        )}
      />

      {showLabel && !collapsed && <span>{label}</span>}

      {/* Side indicator bar */}
      {showIndicator && (
        <span
          className={cn(
            'absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-primary transition-all',
            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-40',
            indicatorClassName
          )}
        />
      )}
    </Link>
  );
}
