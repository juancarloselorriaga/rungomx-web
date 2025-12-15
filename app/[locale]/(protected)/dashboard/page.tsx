import { getSession } from '@/lib/auth/server';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard',
    (messages) => messages.Pages?.Dashboard?.metadata,
    { robots: { index: false, follow: false } },
  );
}

export default async function DashboardPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/dashboard' });
  const t = await getTranslations('pages.dashboard');
  const session = await getSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-2">{t('session.title')}</h2>
        <p className="text-muted-foreground">
          {session?.user?.email
            ? t('session.signedInAs', { email: session.user.email })
            : t('session.signedOut')}
        </p>
      </div>
    </div>
  );
}
