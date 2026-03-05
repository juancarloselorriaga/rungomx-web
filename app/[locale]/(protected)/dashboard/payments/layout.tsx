import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';

type DashboardPaymentsLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

const isSupportedLocale = (value: string): value is 'es' | 'en' =>
  value === 'es' || value === 'en';

export default async function DashboardPaymentsLayout({
  children,
  params,
}: DashboardPaymentsLayoutProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const authContext = await getAuthContext();
  const canAccessPayments =
    authContext.permissions.canViewOrganizersDashboard ||
    authContext.permissions.canManageEvents;

  if (!canAccessPayments) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  return children;
}
