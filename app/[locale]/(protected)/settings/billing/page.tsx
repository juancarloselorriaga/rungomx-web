import { BillingSettingsClient } from '@/components/settings/billing/billing-settings-client';
import { SettingsPageIntro } from '@/components/settings/settings-page-intro';
import { Surface } from '@/components/ui/surface';
import { getAuthContext } from '@/lib/auth/server';
import { getBillingStatusForUser } from '@/lib/billing/queries';
import { serializeBillingStatus } from '@/lib/billing/serialization';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { CreditCard } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/settings/billing',
    (messages) => messages.Pages?.SettingsBilling?.metadata,
    {
      robots: {
        index: false,
        follow: false,
      },
    },
  );
}

export default async function BillingSettingsPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/settings/billing' });
  const tPage = await getTranslations('pages.settings.billing');
  const authContext = await getAuthContext();

  const user = authContext.user;

  const status = user
    ? await getBillingStatusForUser({
        userId: user.id,
        isInternal: authContext.isInternal,
      })
    : null;
  return (
    <div className="space-y-6 sm:space-y-8">
      <SettingsPageIntro
        title={tPage('title')}
        description={tPage('description')}
        eyebrow={tPage('title')}
        userName={user?.name}
        userEmail={user?.email}
      />

      {status && user ? (
        <BillingSettingsClient
          initialStatus={serializeBillingStatus(status)}
          emailVerified={user.emailVerified}
          isInternal={authContext.isInternal}
        />
      ) : (
        <Surface>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-muted p-2 text-muted-foreground">
              <CreditCard className="h-4 w-4" />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">{tPage('title')}</p>
              <p className="text-sm leading-6 text-muted-foreground">{tPage('empty')}</p>
            </div>
          </div>
        </Surface>
      )}
    </div>
  );
}
