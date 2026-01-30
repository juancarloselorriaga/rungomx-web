import { ProAccessStatusClient } from '@/components/admin/users/pro-access/pro-access-status-client';
import { getAuthContext } from '@/lib/auth/server';
import { getPathname } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  const { getTranslations } = await import('next-intl/server');
  const t = await getTranslations({ locale, namespace: 'pages.adminProAccess.metadata.status' });

  return createLocalizedPageMetadata(
    locale,
    '/admin/users/pro-access',
    () => ({
      title: t('title'),
      description: t('description'),
    }),
    { robots: { index: false, follow: false } },
  );
}

export default async function AdminUsersProAccessStatusPage({ params }: LocalePageProps) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/admin/users/pro-access' });
  const authContext = await getAuthContext();

  if (!authContext.permissions.canViewStaffTools) {
    redirect(getPathname({ href: '/admin', locale }));
  }

  return <ProAccessStatusClient />;
}

