'use client';

import { parseResultFinishTimeToMillis } from '@/lib/events/results/ingestion/validation';
import { cn } from '@/lib/utils';
import { type VariantProps } from 'class-variance-authority';
import { Check } from 'lucide-react';
import * as React from 'react';
import { inputVariants } from './input';

/** Strip non-digit characters and cap at 6 digits (HH:MM:SS max). */
export function extractDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

/**
 * Format a raw digit string into colon-separated time.
 *
 * | Digits | Output    |
 * |--------|-----------|
 * | 1      | 1         |
 * | 12     | 12        |
 * | 123    | 1:23      |
 * | 1234   | 12:34     |
 * | 12345  | 1:23:45   |
 * | 123456 | 12:34:56  |
 */
export function formatDigitsAsTime(digits: string): string {
  const len = digits.length;
  if (len <= 2) return digits;
  if (len === 3) return `${digits[0]}:${digits.slice(1)}`;
  if (len === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  if (len === 5) return `${digits[0]}:${digits.slice(1, 3)}:${digits.slice(3)}`;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`;
}

type TimeInputProps = {
  value: string;
  onChange: (formatted: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
} & VariantProps<typeof inputVariants>;

const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(
  ({ value, onChange, placeholder, className, disabled, size, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    const mergedRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const digits = React.useMemo(() => extractDigits(value), [value]);

    const isValid = React.useMemo(() => {
      if (digits.length < 3) return false;
      return parseResultFinishTimeToMillis(value) !== null;
    }, [digits.length, value]);

    const pinCursorToEnd = React.useCallback(() => {
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el && el === document.activeElement) {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    }, []);

    const applyDigits = React.useCallback(
      (nextDigits: string) => {
        const formatted = formatDigitsAsTime(nextDigits);
        onChange(formatted);
        pinCursorToEnd();
      },
      [onChange, pinCursorToEnd],
    );

    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Tab' || event.key === 'Enter') return;

        if (/^\d$/.test(event.key)) {
          event.preventDefault();
          if (digits.length >= 6) return;
          applyDigits(digits + event.key);
          return;
        }

        if (event.key === 'Backspace') {
          event.preventDefault();
          if (digits.length === 0) return;
          applyDigits(digits.slice(0, -1));
          return;
        }

        // Allow modifier combos (Ctrl+A, Cmd+C, etc.)
        if (event.metaKey || event.ctrlKey) return;

        // Block everything else (colons, letters, etc.)
        event.preventDefault();
      },
      [digits, applyDigits],
    );

    // Fallback for paste and autofill
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const pasted = extractDigits(event.target.value);
        applyDigits(pasted);
      },
      [applyDigits],
    );

    return (
      <div className="relative">
        <input
          ref={mergedRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onKeyDown={handleKeyDown}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(inputVariants({ size }), 'pr-9', className)}
          {...props}
        />
        {isValid ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
            <Check
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
          </div>
        ) : null}
      </div>
    );
  },
);

TimeInput.displayName = 'TimeInput';

export { TimeInput };
