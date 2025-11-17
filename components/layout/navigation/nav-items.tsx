'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  Home, Info, Mail, CircleHelp,
  LayoutDashboard, Settings, User, Users,
  Trophy, Calendar, Newspaper
} from 'lucide-react';
import type { NavItem } from '@/components/layout/navigation/types';

// Icon map for all possible icons
const iconMap = {
  Home,
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
  return (
    <div className={cn('flex flex-col space-y-4 p-4', containerClassName)}>
      {items.map(item => {
        const Icon = iconMap[item.iconName as keyof typeof iconMap];

        const content = (
          <Link
            href={item.href}
            className={cn(
              'flex items-center space-x-3 px-2 py-2 text-md font-medium rounded-lg hover:bg-accent transition-colors',
              linkClassName
            )}
            aria-label={item.label}
          >
            <Icon size={iconSize} className={cn('flex-shrink-0', iconClassName)}/>
            {showLabels && <span>{item.label}</span>}
          </Link>
        );

        return (
          <div key={item.href} className={cn('flex flex-row items-center', itemClassName)}>
            {!showLabels ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>{content}</TooltipTrigger>
                  <TooltipContent>
                    <p>{item.label}</p>
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
