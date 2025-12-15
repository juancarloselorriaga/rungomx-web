import { AppLocale } from '@/i18n/routing';
// Import Messages type for next-intl augmentation
import type { Messages } from './types.generated';

// Re-export all generated schemas and types
export * from './types.generated';

// Augment next-intl's AppConfig with our locale and message types
declare module 'next-intl' {
  interface AppConfig {
    Locale: AppLocale;
    Messages: Messages;
  }
}
