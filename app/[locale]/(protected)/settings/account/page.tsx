import { AccountDeleteSection } from '@/components/settings/account/account-delete-section';
import { AccountNameForm } from '@/components/settings/account/account-name-form';
import { AccountPasswordForm } from '@/components/settings/account/account-password-form';
import { SettingsPageIntro } from '@/components/settings/settings-page-intro';
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
    },
  );
}

export default async function AccountSettingsPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/settings/account' });
  const tPage = await getTranslations('pages.settings.account');
  const authContext = await getAuthContext();
  const user = authContext.user;

  return (
    <div className="space-y-6">
      <SettingsPageIntro
        title={tPage('title')}
        description={tPage('description')}
        eyebrow={tPage('title')}
        userName={user?.name}
        userEmail={user?.email}
      />

      <div className="space-y-6">
        <AccountNameForm defaultName={user?.name ?? ''} email={user?.email ?? ''} />
        <AccountPasswordForm />
        <AccountDeleteSection userEmail={user?.email ?? ''} />
      </div>
    </div>
  );
}
