// TypeScript definitions for next-intl translations
// This file provides type safety and autocomplete for translation keys
import type { Messages } from './i18n/types.generated';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface IntlMessages extends Messages {}
}

export {};
