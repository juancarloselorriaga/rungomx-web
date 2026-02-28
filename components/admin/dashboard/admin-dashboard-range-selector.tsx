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
    <div className={cn('inline-flex flex-wrap items-center gap-1', className)} role="group">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={option.value === selected ? 'default' : 'outline'}
          size="sm"
          aria-pressed={option.value === selected}
          onClick={() => handleChange(option.value)}
          className={cn(
            'h-8 rounded-md border-border px-3 text-xs font-medium',
            option.value === selected
              ? 'bg-foreground text-background hover:bg-foreground/90'
              : 'bg-background-surface text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
