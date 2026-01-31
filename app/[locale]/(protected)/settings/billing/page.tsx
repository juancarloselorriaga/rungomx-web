import { BillingSettingsClient } from '@/components/settings/billing/billing-settings-client';
import { getAuthContext } from '@/lib/auth/server';
import { getBillingStatusForUser } from '@/lib/billing/queries';
import { serializeBillingStatus } from '@/lib/billing/serialization';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
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
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">{tPage('title')}</h1>
        <p className="text-muted-foreground">{tPage('description')}</p>
      </div>

      {status && user ? (
        <BillingSettingsClient
          initialStatus={serializeBillingStatus(status)}
          emailVerified={user.emailVerified}
          isInternal={authContext.isInternal}
        />
      ) : (
        <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          {tPage('empty')}
        </div>
      )}
    </div>
  );
}
