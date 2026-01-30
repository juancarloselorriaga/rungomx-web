import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  const { getTranslations } = await import('next-intl/server');
  const t = await getTranslations({ locale, namespace: 'navigation' });

  return {
    title: t('adminUsers'),
    robots: { index: false, follow: false },
  };
}

export default async function AdminUsersEntrypointPage({ params }: LocalePageProps) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/admin/users' });
  const authContext = await getAuthContext();

  if (authContext.permissions.canManageUsers) {
    redirect(getPathname({ href: '/admin/users/internal', locale }));
  }

  redirect(getPathname({ href: '/admin/users/self-signup', locale }));
}

