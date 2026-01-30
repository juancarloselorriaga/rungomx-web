import { BillingTools } from '@/components/admin/billing/billing-tools';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/admin/tools',
    (messages) => messages.Pages?.Dashboard?.metadata,
    { robots: { index: false, follow: false } },
  );
}

export default async function AdminToolsPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/admin/tools' });
  const t = await getTranslations('pages.dashboard');

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('admin.tools.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('admin.tools.description')}</p>
      </div>
      <BillingTools />
    </div>
  );
}
