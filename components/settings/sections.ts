import { getPathname } from '@/i18n/navigation';
import { AppLocale } from '@/i18n/routing';
import type { SettingsSection } from './types';

type TranslateFn = (key: string, values?: Record<string, unknown>) => string;

export function buildSettingsSections(locale: AppLocale, t: TranslateFn): SettingsSection[] {
  return [
    {
      key: 'profile',
      href: getPathname({ href: '/settings/profile', locale }),
      title: t('sections.profile.title'),
      description: t('sections.profile.description'),
    },
    {
      key: 'account',
      href: getPathname({ href: '/settings/account', locale }),
      title: t('sections.account.title'),
      description: t('sections.account.description'),
    },
  ];
}
