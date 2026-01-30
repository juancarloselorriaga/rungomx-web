import { SubmenuContextProvider } from '@/components/layout/navigation/submenu-context-provider';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

type AdminUsersLayoutProps = LocalePageProps & {
  children: ReactNode;
};

export default async function AdminUsersLayout({ children, params }: AdminUsersLayoutProps) {
  await configPageLocale(params, { pathname: '/admin/users' });
  const tNav = await getTranslations('navigation');

  return (
    <SubmenuContextProvider
      submenuId="admin-users"
      title={tNav('adminUsers')}
      subtitle={tNav('adminUsersSubmenu.subtitle')}
      params={{}}
      basePath="/admin/users"
    >
      {children}
    </SubmenuContextProvider>
  );
}

