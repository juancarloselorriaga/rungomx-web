"use client";

import * as React from "react";
import PhoneInputPrimitive from "react-phone-number-input";
import en from "react-phone-number-input/locale/en";
import es from "react-phone-number-input/locale/es";
import type { PhoneInputProps as PhoneInputPropsType } from "@/lib/phone/types";
import { cn } from "@/lib/utils";
import { useLocale } from "next-intl";

import "react-phone-number-input/style.css";

const LOCALE_LABELS = {
  en,
  es,
} as const;

/**
 * PhoneInput Component
 *
 * A reusable phone input component that:
 * - Stores phone numbers in E.164 format (+523317778888)
 * - Supports all countries with flag icons
 * - Provides real-time formatting as user types
 * - Integrates with the project's validation patterns
 *
 * @example
 * ```tsx
 * <PhoneInput
 *   label="Phone Number"
 *   value={phone}
 *   onChange={setPhone}
 *   defaultCountry="MX"
 *   required
 * />
 * ```
 */
export function PhoneInput({
  value,
  onChangeAction,
  error,
  label,
  required,
  disabled,
  defaultCountry = "MX",
  international = true,
  name,
  className,
  inputClassName,
}: PhoneInputPropsType) {
  const locale = useLocale();
  const labels = LOCALE_LABELS[locale as keyof typeof LOCALE_LABELS] || LOCALE_LABELS.en;

  return (
    <div className={cn("space-y-1 text-sm", className)}>
      {label ? (
        <label className="font-medium text-foreground">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </label>
      ) : null}

      <PhoneInputPrimitive
        labels={labels}
        international={international}
        defaultCountry={defaultCountry}
        value={value || undefined}
        onChange={(val) => onChangeAction(val || "")}
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-sm transition",
          "focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30",
          error && "border-destructive focus-within:ring-destructive/30",
          disabled && "opacity-50 cursor-not-allowed",
        )}
        numberInputProps={{
          className: cn(
            "flex-1 bg-transparent text-sm outline-none ring-0",
            "placeholder:text-muted-foreground",
            "disabled:cursor-not-allowed",
            inputClassName,
          ),
          maxLength: 25, // E.164 max is 15 digits, plus formatting characters (spaces, dashes, parentheses)
        }}
        countrySelectProps={{
          className: cn(
            "border-0 bg-transparent text-sm outline-none",
            "focus:ring-0",
          ),
        }}
      />

      {name ? <input type="hidden" name={name} value={value || ""} readOnly /> : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
