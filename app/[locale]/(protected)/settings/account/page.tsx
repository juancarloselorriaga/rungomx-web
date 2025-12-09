import { AccountNameForm } from '@/components/settings/account/account-name-form';
import { AccountPasswordForm } from '@/components/settings/account/account-password-form';
import { SettingsSectionSubnav } from '@/components/settings/settings-section-subnav';
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
    '/settings/account',
    (messages) => messages.Pages?.SettingsAccount?.metadata,
    {
      robots: {
        index: false,
        follow: false,
      },
    }
  );
}

export default async function AccountSettingsPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/settings/account' });
  const tPage = await getTranslations('pages.settings.account');
  const authContext = await getAuthContext();
  const user = authContext.user;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">{tPage('title')}</h1>
        <p className="text-muted-foreground">{tPage('description')}</p>
      </div>

      <SettingsSectionSubnav />

      <div className="space-y-6">
        <AccountNameForm
          defaultName={user?.name ?? ''}
          email={user?.email ?? ''}
        />
        <AccountPasswordForm />
      </div>
    </div>
  );
}
