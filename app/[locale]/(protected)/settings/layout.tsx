import { SettingsShell } from '@/components/settings/settings-shell';
import { buildSettingsSections } from '@/components/settings/sections';
import { getAuthContext } from '@/lib/auth/server';
import { AppLocale } from '@/i18n/routing';
import { configPageLocale } from '@/utils/config-page-locale';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

type SettingsLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: AppLocale }>;
};

export default async function SettingsLayout({ children, params }: SettingsLayoutProps) {
  await configPageLocale(params, { pathname: '/settings' });
  const { locale } = await params;
  const tShell = await getTranslations('components.settings.shell');

  await getAuthContext();

  const sections = buildSettingsSections(locale, (key) => tShell(key as never));

  return (
    <SettingsShell
      title={tShell('title')}
      description={tShell('description')}
      sections={sections}
    >
      {children}
    </SettingsShell>
  );
}
