"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lazy-loaded PhoneInput component with code-splitting
 *
 * This wrapper enables dynamic loading of the phone input component
 * to reduce the initial bundle size. The component and its dependencies
 * (libphonenumber-js, react-phone-number-input) are only loaded when needed.
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
    loading: () => (
      <div className="space-y-1 text-sm">
        <Skeleton className="h-5 w-32" /> {/* Label skeleton */}
        <Skeleton className="h-[42px] w-full" /> {/* Input skeleton - matches py-2 + text-sm + border */}
      </div>
    ),
    ssr: false, // Phone input is client-only
  }
);
