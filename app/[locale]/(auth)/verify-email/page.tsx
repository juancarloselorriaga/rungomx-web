import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { VerifyEmailResend } from '@/components/auth/verify-email-resend';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { ArrowLeft, Mail } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.verifyEmail' });

  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
  };
}

export default async function VerifyEmailPage({
  params,
  searchParams,
}: LocalePageProps & { searchParams?: Promise<{ email?: string; callbackURL?: string }> }) {
  await configPageLocale(params, { pathname: '/verify-email' });
  const t = await getTranslations('pages.verifyEmail');

  const resolvedSearchParams = await searchParams;
  const email = resolvedSearchParams?.email?.trim();
  const callbackURL = resolvedSearchParams?.callbackURL;
  const isAppPathname = (value: string): value is keyof typeof routing.pathnames =>
    Object.prototype.hasOwnProperty.call(routing.pathnames, value);
  const callbackPath = callbackURL && isAppPathname(callbackURL) ? callbackURL : undefined;

  const signInHref = callbackPath
    ? ({ pathname: '/sign-in', query: { callbackURL: callbackPath } } as const)
    : '/sign-in';
  const signUpHref = callbackPath
    ? ({ pathname: '/sign-up', query: { callbackURL: callbackPath } } as const)
    : '/sign-up';

  return (
    <AuthPageShell
      icon={<Mail className="size-5" />}
      title={t('title')}
      description={t('description')}
      footer={
        <div className="space-y-3 border-t border-border/60 pt-5">
          <p className="text-center text-sm text-muted-foreground">{t('noEmailHint')}</p>

          <Button asChild variant="outline" className="w-full">
            <Link href={signInHref}>
              <ArrowLeft className="size-4" />
              {t('backToSignIn')}
            </Link>
          </Button>

          <Button asChild variant="ghost" className="w-full">
            <Link href={signUpHref}>{t('wrongEmail')}</Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-center">
        {email ? (
          <div className="rounded-[1.35rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_84%,var(--background-surface)_16%)] px-4 py-4 text-sm">
            {t('sentTo')} <span className="font-semibold text-foreground">{email}</span>
          </div>
        ) : null}

        <VerifyEmailResend email={email} callbackPath={callbackPath} />
      </div>
    </AuthPageShell>
  );
}
