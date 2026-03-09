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
        'grid w-full grid-cols-1 gap-2 rounded-2xl border bg-muted/25 p-1 sm:grid-cols-3',
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
            'h-10 w-full rounded-xl border-transparent px-4 text-sm font-medium whitespace-nowrap shadow-none',
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
