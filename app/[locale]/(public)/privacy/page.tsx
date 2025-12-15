import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/privacy',
    (messages) => messages.Pages?.Privacy?.metadata,
    {
      robots: { index: false, follow: false },
    },
  );
}

export default async function PrivacyPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/privacy' });
  const t = await getTranslations('components.footer.links');

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">{t('privacy')}</h1>
      <p className="text-muted-foreground">Content coming soon.</p>
    </div>
  );
}
