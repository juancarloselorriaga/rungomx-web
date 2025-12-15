'use client';

import { Button } from '@/components/ui/button';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';

export type SectionSubnavItem = {
  key: string;
  href: string;
  localizedHref?: string;
  label: string;
  description?: string;
};

type SectionSubnavProps = {
  items: SectionSubnavItem[];
  className?: string;
};

export function SectionSubnav({ items, className }: SectionSubnavProps) {
  const pathname = usePathname()?.replace(/\/+$/, '') || '/';

  return (
    <div
      className={cn('flex items-stretch gap-1 rounded-lg border bg-background/60 p-1', className)}
    >
      {items.map((item) => {
        const isActive =
          pathname === item.href || Boolean(item.localizedHref && pathname === item.localizedHref);

        return (
          <Button
            key={item.key}
            asChild
            variant={isActive ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'h-auto min-w-0 flex-1 items-start justify-start gap-2 px-3 py-2 text-left',
              '!shrink overflow-hidden',
              isActive ? 'shadow-sm' : 'text-muted-foreground',
            )}
          >
            <Link
              href={item.href as ComponentProps<typeof Link>['href']}
              scroll={false}
              replace={isActive}
              className="flex min-w-0 w-full flex-col overflow-hidden"
            >
              <div className="flex min-w-0 w-full flex-col">
                <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold leading-tight">
                  {item.label}
                </span>
                {item.description ? (
                  <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-tight text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </div>
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
