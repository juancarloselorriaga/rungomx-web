import { SessionState } from '@/components/auth/session-state';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
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
    '/',
    (messages) => messages.Pages?.Home?.metadata,
    { imagePath: '/og-home.jpg' }
  );
}

export default async function Home({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/' });
  const t = await getTranslations('pages.home');
  const session = await getSession();

  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-card/60 p-8 shadow-sm">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('content.eyebrow')}
          </p>
          <h1 className="text-3xl font-bold leading-tight md:text-4xl">
            {t('content.title')}
          </h1>
          <p className="text-muted-foreground text-base">
            {t('content.description')}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {session ? (
              <>
                <Button asChild>
                  <Link href="/dashboard">
                    {t('actions.goToDashboard')}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/settings">
                    {t('actions.manageAccount')}
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild>
                  <Link href="/sign-up">
                    {t('actions.getStarted')}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/sign-in">
                    {t('actions.signIn')}
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{t('session.serverTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('session.serverDescription')}
          </p>
          <p className="mt-4 text-muted-foreground">
            {session?.user?.email
              ? t('session.serverSignedInAs', { email: session.user.email })
              : t('session.serverSignedOut')}
          </p>
        </div>

        <SessionState initialEmail={session?.user?.email ?? null}/>
      </section>
    </div>
  );
}
