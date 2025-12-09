"use client";

import dynamic from "next/dynamic";
import { FormFieldSkeleton } from "@/components/ui/form-field-skeleton";

/**
 * Lazy-loaded PhoneInput component with code-splitting
 *
 * This wrapper enables dynamic loading of the phone input component
 * to reduce the initial bundle size. The component and its dependencies
 * (libphonenumber-js, react-phone-number-input) are only loaded when needed.
 *
 * Uses FormFieldSkeleton to prevent layout shift while loading.
 *
 * @example
 * ```tsx
 * import { PhoneInput } from "@/components/ui/phone-input-lazy";
 *
 * <PhoneInput
 *   value={phone}
 *   onChange={setPhone}
 *   defaultCountry="MX"
 * />
 * ```
 */
export const PhoneInput = dynamic(
  () => import("./phone-input").then((mod) => ({ default: mod.PhoneInput })),
  {
    loading: () => <FormFieldSkeleton />,
    ssr: false, // Phone input is client-only
  }
);
