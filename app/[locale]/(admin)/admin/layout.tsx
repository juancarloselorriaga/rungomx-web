import AdminLayoutWrapper from '@/components/layout/admin-layout-wrapper';
import { LocaleSyncWrapper } from '@/components/locale-sync-wrapper';
import { getPathname } from '@/i18n/navigation';
import { AppLocale } from '@/i18n/routing';
import { getAuthContext } from '@/lib/auth/server';
import { getProEntitlementForUser } from '@/lib/billing/entitlements';
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

  let isProMembership = false;
  if (authContext.user && !authContext.isInternal) {
    try {
      const entitlement = await getProEntitlementForUser({
        userId: authContext.user.id,
        isInternal: authContext.isInternal,
      });
      isProMembership = entitlement.isPro;
    } catch (error) {
      console.warn('[billing] Failed to resolve pro entitlement for admin nav', error);
      isProMembership = false;
    }
  }

  return (
    <LocaleSyncWrapper>
      <AdminLayoutWrapper permissions={authContext.permissions} isPro={isProMembership}>
        {children}
      </AdminLayoutWrapper>
    </LocaleSyncWrapper>
  );
}
