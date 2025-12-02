"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  value?: string | null;
  onChange?: (value: string) => void;
  locale?: string;
  placeholder?: string;
  clearLabel?: string;
  name?: string;
  className?: string;
};

function formatDatePlaceholder(locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return formatter
    .formatToParts(new Date(2024, 10, 22))
    .map((part) => {
      if (part.type === "day") return "dd";
      if (part.type === "month") return "mm";
      if (part.type === "year") return "yyyy";
      return part.value;
    })
    .join("");
}

function formatDisplayDate(value: string | null | undefined, locale: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

export function DatePicker({
  value,
  onChange,
  locale = "en",
  placeholder,
  clearLabel = "Clear",
  name,
  className,
}: DatePickerProps) {
  const selectedDate = value ? new Date(value) : undefined;
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState<Date | undefined>(selectedDate ?? new Date());
  const weekStartsOn = locale.startsWith("es") ? 1 : 0;

  React.useEffect(() => {
    if (!value) return;
    setMonth(new Date(value));
  }, [value]);

  const formatted = formatDisplayDate(value, locale);
  const resolvedPlaceholder = placeholder ?? formatDatePlaceholder(locale);

  const formatters = React.useMemo(
    () => ({
      formatCaption: (date: Date) =>
        new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date),
      formatWeekdayName: (date: Date) =>
        new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date),
      formatMonthDropdown: (date: Date) =>
        new Intl.DateTimeFormat(locale, { month: "long" }).format(date),
      formatYearDropdown: (date: Date) =>
        new Intl.DateTimeFormat(locale, { year: "numeric" }).format(date),
    }),
    [locale]
  );

  return (
    <div className={cn("w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            data-empty={!selectedDate}
            className="flex w-full items-center justify-between font-normal data-[empty=true]:text-muted-foreground"
          >
            <span className="truncate">
              {formatted || resolvedPlaceholder}
            </span>
            <CalendarIcon className="ml-2 h-4 w-4 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={selectedDate}
            month={month}
            onMonthChange={setMonth}
            formatters={formatters}
            weekStartsOn={weekStartsOn}
            className="min-w-[300px]"
            onSelect={(date) => {
              const iso = date ? date.toISOString().slice(0, 10) : "";
              onChange?.(iso);
              setOpen(false);
            }}
          />
          <div className="flex justify-end px-3 pb-2 pt-1">
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                onChange?.("");
              }}
            >
              {clearLabel}
            </button>
          </div>
        </PopoverContent>
      </Popover>
      {name ? <input type="hidden" name={name} value={value ?? ""} readOnly /> : null}
    </div>
  );
}
