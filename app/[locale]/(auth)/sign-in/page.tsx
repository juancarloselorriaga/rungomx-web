import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { SignInForm } from '@/components/auth/sign-in-form';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { isSafeRedirectPath, normalizeCallbackPath } from '@/lib/utils/redirect';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { CheckCircle, LogIn } from 'lucide-react';
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
  const t = await getTranslations('pages.signIn');
  const authT = await getTranslations('auth');

  const resolvedSearchParams = await searchParams;
  const resetSuccess = resolvedSearchParams?.reset === 'success';
  const callbackPath = (() => {
    const normalized = normalizeCallbackPath(resolvedSearchParams?.callbackURL);
    if (!normalized || !isSafeRedirectPath(normalized)) return undefined;
    return normalized;
  })();
  const signUpHref = callbackPath
    ? ({ pathname: '/sign-up', query: { callbackURL: callbackPath } } as const)
    : '/sign-up';

  return (
    <AuthPageShell
      icon={<LogIn className="size-5" />}
      title={t('title')}
      description={t('description')}
      notice={
        resetSuccess ? (
          <div className="rounded-[1.35rem] border border-emerald-500/25 bg-emerald-500/10 px-4 py-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-1">
                <h2 className="font-medium text-emerald-900 dark:text-emerald-100">
                  {t('passwordResetSuccess')}
                </h2>
                <p className="text-sm leading-6 text-emerald-800 dark:text-emerald-200">
                  {t('passwordResetSuccessDescription')}
                </p>
              </div>
            </div>
          </div>
        ) : null
      }
      footer={
        <p className="border-t border-border/60 pt-5 text-center text-sm text-muted-foreground">
          {authT('noAccount')}{' '}
          <Link className="font-semibold text-primary hover:underline" href={signUpHref}>
            {authT('createAccount')}
          </Link>
        </p>
      }
    >
      <SignInForm callbackPath={callbackPath} />
    </AuthPageShell>
  );
}
