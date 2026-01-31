import { ProFeaturesAdminClient } from '@/components/admin/pro-features/pro-features-admin-client';
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
  const t = await getTranslations({ locale, namespace: 'pages.adminProFeatures.metadata' });

  return createLocalizedPageMetadata(
    locale,
    '/admin/pro-features',
    () => ({
      title: t('title'),
      description: t('description'),
    }),
    { robots: { index: false, follow: false } },
  );
}

export default async function AdminProFeaturesPage({ params }: LocalePageProps) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/admin/pro-features' });
  const authContext = await getAuthContext();

  if (!authContext.permissions.canViewStaffTools) {
    redirect(getPathname({ href: '/admin', locale }));
  }

  return <ProFeaturesAdminClient />;
}
