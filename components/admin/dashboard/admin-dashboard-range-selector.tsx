'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

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

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams?.toString());
    next.set('range', value);
    const href = `${pathname}?${next.toString()}`;
    router.replace(href);
    router.refresh();
  };

  return (
    <div
      className={cn(
        'inline-flex w-full flex-wrap gap-1 rounded-2xl border bg-muted/25 p-1 sm:w-auto',
        className,
      )}
      role="group"
    >
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={option.value === selected ? 'default' : 'outline'}
          size="sm"
          aria-pressed={option.value === selected}
          onClick={() => handleChange(option.value)}
          className={cn(
            'h-9 min-w-[5.5rem] flex-1 rounded-xl border-transparent px-3 text-xs font-medium whitespace-nowrap shadow-none sm:flex-none',
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
