import { SignUpForm } from '@/components/auth/sign-up-form';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { isSafeRedirectPath, normalizeCallbackPath } from '@/lib/utils/redirect';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/sign-up',
    (messages) => messages.Pages?.SignUp?.metadata,
    { robots: { index: false, follow: false } },
  );
}

export default async function SignUpPage({
  params,
  searchParams,
}: LocalePageProps & { searchParams?: Promise<{ callbackURL?: string }> }) {
  await configPageLocale(params, { pathname: '/sign-up' });
  const { locale } = await params;
  const t = await getTranslations('pages.signUp');
  const authT = await getTranslations('auth');
  const resolvedSearchParams = await searchParams;
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
  const signInHref = callbackPath
    ? ({ pathname: '/sign-in', query: { callbackURL: callbackPath } } as const)
    : '/sign-in';

  return (
    <div className="space-y-6 rounded-lg border bg-card p-8 shadow-lg">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <SignUpForm callbackPath={callbackPath} />

      <p className="text-center text-sm text-muted-foreground">
        {authT('hasAccount')}{' '}
        <Link className="font-semibold text-primary hover:underline" href={signInHref}>
          {authT('signIn')}
        </Link>
      </p>
    </div>
  );
}
