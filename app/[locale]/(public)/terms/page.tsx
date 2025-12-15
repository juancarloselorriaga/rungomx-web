import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/terms',
    (messages) => messages.Pages?.Terms?.metadata,
    {
      robots: { index: false, follow: false },
    },
  );
}

export default async function TermsPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/terms' });
  const t = await getTranslations('components.footer.links');

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">{t('terms')}</h1>
      <p className="text-muted-foreground">Content coming soon.</p>
    </div>
  );
}
