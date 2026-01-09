import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { CheckCircle, type LucideIcon } from 'lucide-react';
import * as React from 'react';

const iconVariants = cva('shrink-0', {
  variants: {
    iconVariant: {
      default: 'text-muted-foreground',
      primary: 'text-primary',
      blue: 'text-[var(--brand-blue)]',
      green: 'text-[var(--brand-green)]',
      indigo: 'text-[var(--brand-indigo)]',
      inherit: 'text-inherit',
    },
    iconSize: {
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-6 w-6',
    },
  },
  defaultVariants: {
    iconVariant: 'green',
    iconSize: 'md',
  },
});

const listVariants = cva('', {
  variants: {
    spacing: {
      tight: 'space-y-1',
      normal: 'space-y-2',
      relaxed: 'space-y-3',
      loose: 'space-y-4',
    },
  },
  defaultVariants: {
    spacing: 'normal',
  },
});

export interface IconListItem {
  text: string;
  icon?: LucideIcon;
}

export interface IconListProps
  extends React.HTMLAttributes<HTMLUListElement>,
    VariantProps<typeof iconVariants>,
    VariantProps<typeof listVariants> {
  items: (string | IconListItem)[];
  defaultIcon?: LucideIcon;
}

export function IconList({
  items,
  defaultIcon: DefaultIcon = CheckCircle,
  iconVariant,
  iconSize,
  spacing,
  className,
  ...props
}: IconListProps) {
  return (
    <ul className={cn(listVariants({ spacing }), className)} {...props}>
      {items.map((item, index) => {
        const isObject = typeof item === 'object';
        const text = isObject ? item.text : item;
        const Icon = isObject && item.icon ? item.icon : DefaultIcon;

        return (
          <li key={index} className="flex items-start gap-3">
            <Icon className={cn(iconVariants({ iconVariant, iconSize }), 'mt-0.5')} />
            <span className="text-current">{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
