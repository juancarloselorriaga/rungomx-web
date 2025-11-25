import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/sign-in',
    (messages) => messages.Pages?.SignIn?.metadata,
    { robots: { index: false, follow: false } }
  );
}

export default async function SignInPage({ params }: LocalePageProps) {
  await configPageLocale(params);
  const t = await getTranslations('pages.signIn');

  return (
    <div className="rounded-lg border bg-card p-8 shadow-lg">
      <h1 className="text-2xl font-bold mb-4">{t('title')}</h1>
      <p className="text-muted-foreground">
        {t('description')}
      </p>
    </div>
  );
}
