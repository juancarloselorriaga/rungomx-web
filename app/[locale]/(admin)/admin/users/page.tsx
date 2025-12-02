import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/admin/users',
    (messages) => messages.Pages?.Dashboard?.metadata,
    { robots: { index: false, follow: false } }
  );
}

export default async function AdminUsersPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/admin/users' });
  const t = await getTranslations('pages.dashboard');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('admin.users.title')}</h1>
      <p className="text-muted-foreground text-sm">
        {t('admin.users.description')}
      </p>
      <div className="rounded-lg border bg-card p-4 shadow-sm text-sm text-muted-foreground">
        {t('admin.users.placeholder')}
      </div>
    </div>
  );
}
