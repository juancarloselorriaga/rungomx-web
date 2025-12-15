'use client';

import { FormFieldSkeleton } from '@/components/ui/form-field-skeleton';
import dynamic from 'next/dynamic';

/**
 * Lazy-loaded CountrySelectField component with code-splitting
 *
 * This wrapper enables dynamic loading of the country select field component
 * to reduce the initial bundle size. The component and its dependencies
 * (react-phone-number-input locale files for 245+ countries) are only loaded when needed.
 *
 * Uses FormFieldSkeleton to prevent layout shift while loading.
 *
 * Benefits:
 * - Reduces initial bundle size by ~50KB (locale files for 245+ countries)
 * - Only loads when the country field is rendered
 * - Zero layout shift with skeleton loader
 *
 * @example
 * ```tsx
 * import { CountrySelectField } from "@/components/settings/fields/country-select-field-lazy";
 *
 * <CountrySelectField
 *   label="Country"
 *   value={country}
 *   onChangeAction={setCountry}
 *   options={countries}
 * />
 * ```
 */
export const CountrySelectField = dynamic(
  () =>
    import('./country-select-field').then((mod) => ({
      default: mod.CountrySelectField,
    })),
  {
    loading: () => <FormFieldSkeleton />,
    ssr: false, // Country select is client-only due to locale detection
  },
);
