'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface NavActionContentProps {
  icon: LucideIcon;
  label: string;
  collapsed?: boolean;
  iconSize?: number;
  labelDelay?: string;
  labelClassName?: string;
  iconClassName?: string;
}

export const navActionContainer = (className?: string) =>
  cn(
    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300 ease-in-out',
    className,
  );

export function NavActionContent({
  icon: Icon,
  label,
  collapsed = false,
  iconSize = 20,
  labelDelay = '120ms',
  labelClassName,
  iconClassName,
}: NavActionContentProps) {
  return (
    <>
      <Icon
        className={cn(
          `flex-shrink-0 size-${iconSize / 4} transition-colors group-hover:text-foreground`,
          iconClassName,
        )}
      />
      <span
        className={cn(
          'min-w-0 overflow-hidden whitespace-nowrap text-left transition-[opacity,transform,max-width] duration-300 ease-in-out',
          collapsed ? 'max-w-0 opacity-0' : 'max-w-[200px] opacity-100',
          labelClassName,
        )}
        style={{ transitionDelay: collapsed ? '0ms' : labelDelay }}
      >
        {label}
      </span>
    </>
  );
}
