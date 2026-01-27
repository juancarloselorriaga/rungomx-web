'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Calendar as CalendarIcon } from 'lucide-react';
import * as React from 'react';
import type { Matcher } from 'react-day-picker';

type DatePickerProps = {
  value?: string | null;
  onChangeAction?: (value: string) => void;
  locale?: string;
  placeholder?: string;
  clearLabel?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
};

function formatDateForInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(date.getTime())) return date;
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function formatDatePlaceholder(locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return formatter
    .formatToParts(new Date(2024, 10, 22))
    .map((part) => {
      if (part.type === 'day') return 'dd';
      if (part.type === 'month') return 'mm';
      if (part.type === 'year') return 'yyyy';
      return part.value;
    })
    .join('');
}

function formatDisplayDate(value: string | null | undefined, locale: string) {
  const parsed = parseLocalDate(value);
  if (!parsed) return '';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

export function DatePicker({
  value,
  onChangeAction,
  locale = 'en',
  placeholder,
  clearLabel = 'Clear',
  name,
  className,
  disabled = false,
  min,
  max,
}: DatePickerProps) {
  const selectedDate = parseLocalDate(value);
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState<Date | undefined>(selectedDate ?? new Date());
  const weekStartsOn = locale.startsWith('es') ? 1 : 0;

  React.useEffect(() => {
    if (!disabled) return;
    setOpen(false);
  }, [disabled]);

  React.useEffect(() => {
    if (!value) return;
    const parsed = parseLocalDate(value);
    if (parsed) {
      setMonth(parsed);
    }
  }, [value]);

  const disabledDays = React.useMemo(() => {
    const matchers: Matcher[] = [];
    const minDate = parseLocalDate(min);
    const maxDate = parseLocalDate(max);
    if (minDate) matchers.push({ before: minDate });
    if (maxDate) matchers.push({ after: maxDate });
    return matchers.length ? matchers : undefined;
  }, [min, max]);

  const formatted = formatDisplayDate(value, locale);
  const resolvedPlaceholder = placeholder ?? formatDatePlaceholder(locale);

  const formatters = React.useMemo(
    () => ({
      formatCaption: (date: Date) =>
        new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date),
      formatWeekdayName: (date: Date) =>
        new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date),
      formatMonthDropdown: (date: Date) =>
        new Intl.DateTimeFormat(locale, { month: 'long' }).format(date),
      formatYearDropdown: (date: Date) =>
        new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(date),
    }),
    [locale],
  );

  return (
    <div className={cn('w-full', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            data-empty={!selectedDate}
            disabled={disabled}
            className="flex h-auto w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition font-normal data-[empty=true]:text-muted-foreground hover:bg-background hover:text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-background dark:hover:bg-background"
          >
            <span className="truncate">{formatted || resolvedPlaceholder}</span>
            <CalendarIcon className="ml-2 h-4 w-4 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
          <Calendar
            mode="single"
            captionLayout="dropdown"
            hideNavigation
            selected={selectedDate}
            month={month}
            onMonthChange={setMonth}
            formatters={formatters}
            weekStartsOn={weekStartsOn}
            className="min-w-[300px]"
            disabled={disabledDays}
            onSelect={(date) => {
              if (!date) {
                onChangeAction?.('');
                setOpen(false);
                return;
              }
              // Format date in local timezone to avoid off-by-one errors
              onChangeAction?.(formatDateForInput(date));
              setOpen(false);
            }}
          />
          <div className="flex justify-end px-3 pb-2 pt-1">
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                onChangeAction?.('');
              }}
            >
              {clearLabel}
            </button>
          </div>
        </PopoverContent>
      </Popover>
      {name ? <input type="hidden" name={name} value={value ?? ''} readOnly /> : null}
    </div>
  );
}
