import AdminLayoutWrapper from '@/components/layout/admin-layout-wrapper';
import { LocaleSyncWrapper } from '@/components/locale-sync-wrapper';
import { getPathname } from '@/i18n/navigation';
import { AppLocale } from '@/i18n/routing';
import { getAuthContext } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

type AdminLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: AppLocale }>;
};

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const { locale } = await params;
  const authContext = await getAuthContext();

  if (!authContext.session) {
    redirect(getPathname({ href: '/sign-in', locale }));
  }

  if (!authContext.permissions.canAccessAdminArea) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  return (
    <LocaleSyncWrapper>
      <AdminLayoutWrapper permissions={authContext.permissions}>{children}</AdminLayoutWrapper>
    </LocaleSyncWrapper>
  );
}
