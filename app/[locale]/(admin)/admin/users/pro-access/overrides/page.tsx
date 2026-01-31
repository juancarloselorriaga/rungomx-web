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
  const t = await getTranslations({ locale, namespace: 'pages.adminProAccess.metadata.overrides' });

  return createLocalizedPageMetadata(
    locale,
    '/admin/users/pro-access/overrides',
    () => ({
      title: t('title'),
      description: t('description'),
    }),
    { robots: { index: false, follow: false } },
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminUsersProAccessOverridesPage({
  params,
  searchParams,
}: LocalePageProps & { searchParams?: SearchParams }) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/admin/users/pro-access/overrides' });
  const authContext = await getAuthContext();

  if (!authContext.permissions.canViewStaffTools) {
    redirect(getPathname({ href: '/admin', locale }));
  }

  const rawEmail = searchParams?.email;
  const email = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail;

  const basePath = getPathname({ href: '/admin/users/pro-access', locale });
  const nextSearch = new URLSearchParams();
  if (email) nextSearch.set('email', email);
  nextSearch.set('section', 'overrides');

  redirect(`${basePath}?${nextSearch.toString()}`);
}
