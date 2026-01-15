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
  showLabels?: boolean;
  onItemClick?: () => void;
}

export function NavItems({
  items,
  containerClassName,
  itemClassName,
  iconClassName,
  linkClassName,
  iconSize = 20,
  showLabels = true,
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

        const content = (
          <NavLink
            href={item.href}
            icon={Icon}
            label={label}
            iconSize={iconSize}
            showLabel={showLabels}
            allowPrefixMatch={!hasChild}
            iconClassName={iconClassName}
            linkClassName={linkClassName}
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
