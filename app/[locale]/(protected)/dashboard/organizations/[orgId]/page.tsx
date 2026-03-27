import { SubmenuContextProvider } from '@/components/layout/navigation/submenu-context-provider';
import { DashboardPageIntro, DashboardPageIntroMeta } from '@/components/dashboard/page-intro';
import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getOrganizationWithMembers } from '@/lib/organizations/queries';
import { getOrgMembership, hasOrgPermission } from '@/lib/organizations/permissions';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { OrganizationMembersManager } from './organization-members-manager';
import { OrganizationSettingsForm } from './organization-settings-form';
import { PayoutProfileForm } from './payout-profile-form';
import { getPayoutProfile } from '@/lib/organizations/payout/actions';

type OrganizationDetailPageProps = LocalePageProps & {
  params: Promise<{ locale: string; orgId: string }>;
};

export async function generateMetadata({ params }: OrganizationDetailPageProps): Promise<Metadata> {
  const { locale, orgId } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/organizations/[orgId]',
    (messages) => messages.Pages?.DashboardOrganizations?.metadata,
    {
      params: { orgId },
      robots: { index: false, follow: false },
    },
  );
}

export default async function OrganizationDetailPage({ params }: OrganizationDetailPageProps) {
  const { locale, orgId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/organizations/[orgId]' });
  const t = await getTranslations('pages.dashboard.organizations');
  const authContext = await getAuthContext();

  // Access gate: organizers and internal staff only.
  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard || authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  const organization = await getOrganizationWithMembers(orgId);
  if (!organization) {
    redirect(getPathname({ href: '/dashboard/organizations', locale }));
  }

  const organizationDetail = organization;

  const membership = await getOrgMembership(authContext.user!.id, orgId);
  const isSupportUser = authContext.permissions.canManageEvents;
  if (!membership && !isSupportUser) {
    redirect(getPathname({ href: '/dashboard/organizations', locale }));
  }

  const canManageMembers =
    isSupportUser || (membership ? hasOrgPermission(membership.role, 'canManageMembers') : false);
  const isOwner = membership?.role === 'owner';
  const isAdmin = membership?.role === 'admin';
  const canEditPayout = isSupportUser || isOwner || isAdmin;

  const payoutProfileResult = canEditPayout
    ? await getPayoutProfile({ organizationId: organizationDetail.id })
    : { ok: true as const, data: null };

  return (
    <SubmenuContextProvider
      submenuId="org-detail"
      title={organizationDetail.name}
      subtitle={undefined}
      params={{ orgId }}
      basePath={`/dashboard/organizations/${orgId}`}
      footerLink={null}
    >
      <div className="space-y-6">
        <DashboardPageIntro
          title={organizationDetail.name}
          description={`${t('detail.slugLabel')}: ${organizationDetail.slug}`}
          aside={
            <DashboardPageIntroMeta
              title={organizationDetail.name}
              items={[{ label: t('detail.slugLabel'), value: organizationDetail.slug }]}
              className="bg-background/72"
            />
          }
        />

        <OrganizationSettingsForm
          organizationId={organizationDetail.id}
          name={organizationDetail.name}
          slug={organizationDetail.slug}
          canEdit={isOwner}
        />

        <OrganizationMembersManager
          organizationId={organizationDetail.id}
          members={organizationDetail.members}
          canManageMembers={canManageMembers}
          currentUserId={authContext.user!.id}
          isSupportUser={isSupportUser}
        />

        <PayoutProfileForm
          organizationId={organizationDetail.id}
          canEdit={canEditPayout}
          initialProfile={payoutProfileResult.ok ? payoutProfileResult.data : null}
          initialError={payoutProfileResult.ok ? null : payoutProfileResult.error}
        />
      </div>
    </SubmenuContextProvider>
  );
}
