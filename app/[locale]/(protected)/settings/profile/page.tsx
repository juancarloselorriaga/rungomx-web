import { ProfilePictureSection } from '@/components/settings/profile/profile-picture-section';
import { ProfileSettingsForm } from '@/components/settings/profile/profile-settings-form';
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
    '/settings/profile',
    (messages) => messages.Pages?.SettingsProfile?.metadata,
    {
      robots: {
        index: false,
        follow: false,
      },
    },
  );
}

export default async function ProfileSettingsPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/settings/profile' });
  const tPage = await getTranslations('pages.settings.profile');
  const authContext = await getAuthContext();

  return (
    <div className="space-y-6">
      <SettingsPageIntro
        title={tPage('title')}
        description={tPage('description')}
        eyebrow={tPage('title')}
        userName={authContext.user?.name}
        userEmail={authContext.user?.email}
      />

      <ProfilePictureSection user={authContext.user} isInternal={authContext.isInternal} />

      <ProfileSettingsForm
        profile={authContext.profile}
        profileStatus={authContext.profileStatus}
        profileMetadata={authContext.profileMetadata}
        requiredFieldKeys={authContext.profileMetadata.requiredFieldKeys}
      />
    </div>
  );
}
