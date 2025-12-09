import { getAuthContext } from '@/lib/auth/server';
import { AppLocale } from '@/i18n/routing';
import { configPageLocale } from '@/utils/config-page-locale';
import type { ReactNode } from 'react';

type SettingsLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: AppLocale }>;
};

export default async function SettingsLayout({ children, params }: SettingsLayoutProps) {
  await configPageLocale(params, { pathname: '/settings' });
  await getAuthContext();
  return (
    <div className="space-y-6">
      {children}
    </div>
  );
}
