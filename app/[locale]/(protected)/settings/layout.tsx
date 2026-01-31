import { AppLocale } from '@/i18n/routing';
import { SubmenuContextProvider } from '@/components/layout/navigation/submenu-context-provider';
import { getAuthContext } from '@/lib/auth/server';
import { configPageLocale } from '@/utils/config-page-locale';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

type SettingsLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: AppLocale }>;
};

export default async function SettingsLayout({ children, params }: SettingsLayoutProps) {
  await configPageLocale(params, { pathname: '/settings' });
  await getAuthContext();
  const tSettings = await getTranslations('pages.settings');

  return (
    <SubmenuContextProvider
      submenuId="settings"
      title={tSettings('title')}
      subtitle={tSettings('description')}
      params={{ section: 'settings' }}
      basePath="/settings"
    >
      <div className="space-y-6">{children}</div>
    </SubmenuContextProvider>
  );
}
