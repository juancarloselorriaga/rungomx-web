'use client';

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export type SearchablePickerOption = {
  value: string;
  label: string;
  description?: string | null;
  meta?: React.ReactNode;
  data?: unknown;
};

type SearchablePickerProps = {
  value: string;
  onChangeAction: (value: string) => void;
  onSelectOptionAction?: (option: SearchablePickerOption) => void;
  loadOptionsAction: (query: string) => Promise<SearchablePickerOption[]>;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  errorLabel?: string;
  loadingLabel?: string;
  inputType?: React.InputHTMLAttributes<HTMLInputElement>['type'];
  debounceMs?: number;
  name?: string;
};

export function SearchablePicker({
  value,
  onChangeAction,
  onSelectOptionAction,
  loadOptionsAction,
  disabled = false,
  invalid = false,
  placeholder,
  emptyLabel,
  errorLabel,
  loadingLabel,
  inputType = 'text',
  debounceMs = 300,
  name,
}: SearchablePickerProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SearchablePickerOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedQuery = useMemo(() => value.trim(), [value]);

  useEffect(() => {
    if (!open) return;

    let isCanceled = false;
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const nextOptions = await loadOptionsAction(normalizedQuery);
        if (isCanceled) return;
        setOptions(nextOptions);
      } catch (error) {
        console.error('[SearchablePicker] Failed to load options', error);
        if (isCanceled) return;
        setLoadError('LOAD_FAILED');
        setOptions([]);
      } finally {
        if (isCanceled) return;
        setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      isCanceled = true;
      window.clearTimeout(timeout);
    };
  }, [debounceMs, loadOptionsAction, normalizedQuery, open]);

  const handleSelectOption = (option: SearchablePickerOption) => {
    onChangeAction(option.value);
    onSelectOptionAction?.(option);
    setOpen(false);
    inputRef.current?.focus();
  };

  const emptyStateLabel = loadError
    ? errorLabel ?? emptyLabel ?? 'Could not load results'
    : emptyLabel ?? 'No matches found';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type={inputType}
            autoComplete="off"
            name={name}
            className={cn(
              'h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              invalid && 'border-destructive focus-visible:border-destructive',
              disabled && 'opacity-60',
            )}
            value={value}
            onChange={(event) => onChangeAction(event.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
          />
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <div className="max-h-72 overflow-auto p-1">
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              <span>{loadingLabel ?? 'Loading…'}</span>
            </div>
          ) : options.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyStateLabel}</p>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => handleSelectOption(option)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{option.label}</p>
                  {option.description ? (
                    <p className="truncate text-xs text-muted-foreground">{option.description}</p>
                  ) : null}
                </div>
                {option.meta ? <div className="shrink-0 text-xs text-muted-foreground">{option.meta}</div> : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
