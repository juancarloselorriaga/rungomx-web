import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { isSafeRedirectPath, normalizeCallbackPath } from '@/lib/utils/redirect';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { UserRoundPlus } from 'lucide-react';
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
  const t = await getTranslations('pages.signUp');
  const authT = await getTranslations('auth');
  const resolvedSearchParams = await searchParams;
  const callbackPath = (() => {
    const normalized = normalizeCallbackPath(resolvedSearchParams?.callbackURL);
    if (!normalized || !isSafeRedirectPath(normalized)) return undefined;
    return normalized;
  })();
  const signInHref = callbackPath
    ? ({ pathname: '/sign-in', query: { callbackURL: callbackPath } } as const)
    : '/sign-in';

  return (
    <AuthPageShell
      icon={<UserRoundPlus className="size-5" />}
      title={t('title')}
      description={t('description')}
      footer={
        <p className="border-t border-border/60 pt-5 text-center text-sm text-muted-foreground">
          {authT('hasAccount')}{' '}
          <Link className="font-semibold text-primary hover:underline" href={signInHref}>
            {authT('signIn')}
          </Link>
        </p>
      }
    >
      <SignUpForm callbackPath={callbackPath} />
    </AuthPageShell>
  );
}
