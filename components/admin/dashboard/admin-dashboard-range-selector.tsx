'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

export type AdminDashboardRangeValue = '7d' | '14d' | '30d';

export type AdminDashboardRangeOption = {
  value: AdminDashboardRangeValue;
  label: string;
};

type AdminDashboardRangeSelectorProps = {
  options: AdminDashboardRangeOption[];
  selected: AdminDashboardRangeValue;
  className?: string;
};

export function AdminDashboardRangeSelector({
  options,
  selected,
  className,
}: AdminDashboardRangeSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams?.toString());
    next.set('range', value);
    const href = `${pathname}?${next.toString()}`;
    startTransition(() => {
      router.replace(href);
    });
  };

  return (
    <div
      className={cn(
        'grid w-full grid-cols-3 gap-1 rounded-xl border bg-muted/25 p-1 sm:gap-2 sm:rounded-2xl',
        isPending ? 'opacity-80' : '',
        className,
      )}
      role="group"
      aria-busy={isPending}
    >
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={option.value === selected ? 'default' : 'outline'}
          size="sm"
          aria-pressed={option.value === selected}
          disabled={isPending}
          onClick={() => handleChange(option.value)}
          className={cn(
            'h-9 w-full rounded-lg border-transparent px-2 text-xs font-medium whitespace-nowrap shadow-none sm:h-10 sm:rounded-xl sm:px-4 sm:text-sm',
            option.value === selected
              ? 'border-primary/40 bg-primary/10 text-foreground hover:bg-primary/12'
              : 'bg-transparent text-muted-foreground hover:bg-background hover:text-foreground',
          )}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
