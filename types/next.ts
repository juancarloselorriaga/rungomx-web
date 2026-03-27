import { AppLocale } from '@/i18n/routing';

export type LocalePageProps = {
  params: Promise<{ locale: AppLocale }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};
