'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ChevronDownIcon } from 'lucide-react';
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

  const selectedOption = options.find((option) => option.value === selected);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-2 rounded-md border-border bg-background-surface px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground',
            className,
          )}
        >
          <span className="truncate">{selectedOption?.label ?? selected}</span>
          <ChevronDownIcon className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuRadioGroup value={selected} onValueChange={handleChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
