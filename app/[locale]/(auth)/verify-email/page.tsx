import { Button } from '@/components/ui/button';
import { VerifyEmailResend } from '@/components/auth/verify-email-resend';
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
    <div className="space-y-6 rounded-lg border bg-card p-8 shadow-lg text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Mail className="size-8 text-primary" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
        {email && (
          <p className="text-sm">
            {t('sentTo')}{' '}
            <span className="font-semibold">{email}</span>
          </p>
        )}
      </div>

      <VerifyEmailResend email={email} callbackPath={callbackPath} />

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('noEmailHint')}</p>

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
    </div>
  );
}
