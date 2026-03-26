'use client';

import { NavLink } from '@/components/layout/navigation/nav-link';
import type { NavItem } from '@/components/layout/navigation/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Calendar,
  CircleHelp,
  FileText,
  Info,
  LayoutDashboard,
  Medal,
  Mail,
  Newspaper,
  Settings,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

// Icon map for all possible icons
const iconMap = {
  Info,
  Mail,
  CircleHelp,
  LayoutDashboard,
  Settings,
  User,
  Users,
  Trophy,
  Calendar,
  Medal,
  Newspaper,
  FileText,
} as const satisfies Record<NavItem['iconName'], typeof Info>;

interface NavItemsProps {
  items: readonly NavItem[];
  containerClassName?: string;
  itemClassName?: string;
  iconClassName?: string;
  linkClassName?: string;
  iconSize?: number;
  showIcons?: boolean;
  showLabels?: boolean;
  activeClassName?: string;
  inactiveClassName?: string;
  showIndicator?: boolean;
  onItemClick?: () => void;
}

export function NavItems({
  items,
  containerClassName,
  itemClassName,
  iconClassName,
  linkClassName,
  iconSize = 20,
  showIcons = true,
  showLabels = true,
  activeClassName,
  inactiveClassName,
  showIndicator,
  onItemClick,
}: NavItemsProps) {
  const t = useTranslations('navigation');
  const itemHrefs = items.map((item) =>
    typeof item.href === 'string' ? item.href : (item.href.pathname ?? '/'),
  );

  return (
    <div className={cn('flex flex-col space-y-4 p-4', containerClassName)}>
      {items.map((item) => {
        const Icon = iconMap[item.iconName];
        const label = t(item.labelKey);
        const itemHref = typeof item.href === 'string' ? item.href : (item.href.pathname ?? '/');
        const hasChild = itemHrefs.some(
          (href) => href !== itemHref && href.startsWith(`${itemHref}/`),
        );
        const isSecondary = item.emphasis === 'secondary';

        const content = (
            <NavLink
              href={item.href}
              icon={Icon}
              label={label}
              iconSize={iconSize}
              showIcon={showIcons}
              showLabel={showLabels}
              allowPrefixMatch={!hasChild}
              iconClassName={cn(iconClassName, isSecondary && 'opacity-80')}
              linkClassName={cn(linkClassName, isSecondary && 'text-muted-foreground/85')}
              activeClassName={activeClassName}
              inactiveClassName={
                inactiveClassName ??
                (isSecondary
                  ? 'text-muted-foreground/75 hover:bg-accent/70 hover:text-foreground'
                  : undefined)
              }
              showIndicator={showIndicator}
              onClick={onItemClick}
            />
        );

        return (
          <div key={itemHref} className={cn('flex flex-row items-center', itemClassName)}>
            {!showLabels ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>{content}</TooltipTrigger>
                  <TooltipContent>
                    <p>{label}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              content
            )}
          </div>
        );
      })}
    </div>
  );
}
