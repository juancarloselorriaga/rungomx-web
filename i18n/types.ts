import { AppLocale } from '@/i18n/routing';
import type messages from '@/messages/en.json';

export type Messages = typeof messages;

declare module 'next-intl' {
  interface AppConfig {
    Locale: AppLocale;
    Messages: Messages;
  }
}
