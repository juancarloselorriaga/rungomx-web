import { AccountNameForm } from '@/components/settings/account/account-name-form';
import { AccountPasswordForm } from '@/components/settings/account/account-password-form';
import { getAuthContext } from '@/lib/auth/server';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/admin/account',
    (messages) => messages.Pages?.AdminAccount?.metadata,
    {
      robots: {
        index: false,
        follow: false,
      },
    },
  );
}

export default async function AdminAccountPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/admin/account' });
  const tPage = await getTranslations('pages.admin.account');
  const authContext = await getAuthContext();
  const user = authContext.user;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">{tPage('title')}</h1>
        <p className="text-muted-foreground">{tPage('description')}</p>
      </div>

      <div className="space-y-8">
        <AccountNameForm defaultName={user?.name ?? ''} email={user?.email ?? ''} variant="admin" />
        <AccountPasswordForm variant="admin" />
      </div>
    </div>
  );
}
