import { SignInForm } from '@/components/auth/sign-in-form';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { isSafeRedirectPath, normalizeCallbackPath } from '@/lib/utils/redirect';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { CheckCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/sign-in',
    (messages) => messages.Pages?.SignIn?.metadata,
    { robots: { index: false, follow: false } },
  );
}

export default async function SignInPage({
  params,
  searchParams,
}: LocalePageProps & { searchParams?: Promise<{ reset?: string; callbackURL?: string }> }) {
  await configPageLocale(params, { pathname: '/sign-in' });
  const { locale } = await params;
  const t = await getTranslations('pages.signIn');
  const authT = await getTranslations('auth');

  const resolvedSearchParams = await searchParams;
  const resetSuccess = resolvedSearchParams?.reset === 'success';
  const callbackPath = (() => {
    const normalized = normalizeCallbackPath(resolvedSearchParams?.callbackURL);
    if (!normalized || !isSafeRedirectPath(normalized)) return undefined;

    // Strip locale prefix (our i18n router will re-apply it)
    const localePrefix = `/${locale}`;
    if (normalized === localePrefix) return '/';
    if (normalized.startsWith(`${localePrefix}/`)) {
      return normalized.slice(localePrefix.length) || '/';
    }

    return normalized;
  })();
  const signUpHref = callbackPath
    ? ({ pathname: '/sign-up', query: { callbackURL: callbackPath } } as const)
    : '/sign-up';

  return (
    <div className="space-y-6 rounded-lg border bg-card p-8 shadow-lg">
      {resetSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/50">
          <div className="flex items-start gap-3">
            <CheckCircle className="size-5 text-green-600 shrink-0 mt-0.5 dark:text-green-400" />
            <div className="space-y-1">
              <h3 className="font-semibold text-green-900 dark:text-green-100">
                {t('passwordResetSuccess')}
              </h3>
              <p className="text-sm text-green-800 dark:text-green-200">
                {t('passwordResetSuccessDescription')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <SignInForm callbackPath={callbackPath} />

      <p className="text-center text-sm text-muted-foreground">
        {authT('noAccount')}{' '}
        <Link className="font-semibold text-primary hover:underline" href={signUpHref}>
          {authT('createAccount')}
        </Link>
      </p>
    </div>
  );
}
