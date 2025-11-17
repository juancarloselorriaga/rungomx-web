'use client';

import { navItems, iconMap } from '@/components/layout/navigation/constants';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface NavItemsProps {
  containerClassName?: string;
  itemClassName?: string;
  iconClassName?: string;
  linkClassName?: string;
  iconSize?: number;
  showLabels?: boolean;
}

export function NavItems({
  containerClassName,
  itemClassName,
  iconClassName,
  linkClassName,
  iconSize = 20,
  showLabels = true,
}: NavItemsProps) {
  return (
    <div className={cn('flex flex-col space-y-4 p-4', containerClassName)}>
      {navItems.map(item => {
        const Icon = iconMap[item.iconName];

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
