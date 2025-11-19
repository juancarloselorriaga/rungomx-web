'use client';

import type { NavItem } from '@/components/layout/navigation/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Calendar,
  CircleHelp,
  Info,
  LayoutDashboard,
  Mail,
  Newspaper,
  Settings,
  Trophy,
  User,
  Users
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

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
} as const;

interface NavItemsProps {
  items: readonly NavItem[];
  containerClassName?: string;
  itemClassName?: string;
  iconClassName?: string;
  linkClassName?: string;
  iconSize?: number;
  showLabels?: boolean;
}

export function NavItems({
  items,
  containerClassName,
  itemClassName,
  iconClassName,
  linkClassName,
  iconSize = 20,
  showLabels = true,
}: NavItemsProps) {
  const t = useTranslations('Navigation');

  return (
    <div className={cn('flex flex-col space-y-4 p-4', containerClassName)}>
      {items.map(item => {
        const Icon = iconMap[item.iconName as keyof typeof iconMap];
        const label = t(item.labelKey as any);

        const content = (
          <Link
            href={item.href}
            className={cn(
              'flex items-center space-x-3 px-2 py-2 text-md font-medium rounded-lg hover:bg-accent transition-colors',
              linkClassName
            )}
            aria-label={label}
          >
            <Icon size={iconSize} className={cn('flex-shrink-0', iconClassName)}/>
            {showLabels && <span>{label}</span>}
          </Link>
        );

        return (
          <div key={item.href} className={cn('flex flex-row items-center', itemClassName)}>
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
