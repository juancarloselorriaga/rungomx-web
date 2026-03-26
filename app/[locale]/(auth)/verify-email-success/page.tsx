import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { CheckCircle2 } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.verifyEmailSuccess' });

  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
  };
}

export default async function VerifyEmailSuccessPage({
  params,
  searchParams,
}: LocalePageProps & { searchParams?: Promise<{ callbackURL?: string }> }) {
  await configPageLocale(params, { pathname: '/verify-email-success' });
  const t = await getTranslations('pages.verifyEmailSuccess');

  const resolvedSearchParams = await searchParams;
  const callbackURL = resolvedSearchParams?.callbackURL;
  const isAppPathname = (value: string): value is keyof typeof routing.pathnames =>
    Object.prototype.hasOwnProperty.call(routing.pathnames, value);
  const callbackPath = callbackURL && isAppPathname(callbackURL) ? callbackURL : undefined;
  const signInHref = callbackPath
    ? ({ pathname: '/sign-in', query: { callbackURL: callbackPath } } as const)
    : '/sign-in';

  return (
    <AuthPageShell
      icon={<CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />}
      title={t('title')}
      description={t('description')}
    >
      <Button asChild className="w-full">
        <Link href={signInHref}>{t('signInButton')}</Link>
      </Button>
    </AuthPageShell>
  );
}
