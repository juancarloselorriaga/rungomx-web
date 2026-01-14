import { getPathname, Link } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { isEventsEnabled } from '@/lib/features/flags';
import { getOrganizationWithMembers } from '@/lib/organizations/queries';
import { getOrgMembership, hasOrgPermission } from '@/lib/organizations/permissions';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { OrganizationMembersManager } from './organization-members-manager';

type OrganizationDetailPageProps = LocalePageProps & {
  params: Promise<{ locale: string; orgId: string }>;
};

export async function generateMetadata({
  params,
}: OrganizationDetailPageProps): Promise<Metadata> {
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

  // Phase 0 gate: organizers need flag enabled, internal staff with canManageEvents bypass
  const canAccessEvents =
    (isEventsEnabled() && authContext.permissions.canViewOrganizersDashboard) ||
    authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  const organization = await getOrganizationWithMembers(orgId);
  if (!organization) {
    redirect(getPathname({ href: '/dashboard/organizations', locale }));
  }

  const membership = await getOrgMembership(authContext.user!.id, orgId);
  const isSupportUser = authContext.permissions.canManageEvents;
  if (!membership && !isSupportUser) {
    redirect(getPathname({ href: '/dashboard/organizations', locale }));
  }

  const canManageMembers =
    isSupportUser || (membership ? hasOrgPermission(membership.role, 'canManageMembers') : false);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/organizations"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('detail.backToList')}
        </Link>
        <h1 className="text-3xl font-bold mb-2">{organization.name}</h1>
        <p className="text-muted-foreground">
          {t('detail.slugLabel')}: {organization.slug}
        </p>
      </div>

      <OrganizationMembersManager
        organizationId={organization.id}
        members={organization.members}
        canManageMembers={canManageMembers}
        currentUserId={authContext.user!.id}
        isSupportUser={isSupportUser}
      />
    </div>
  );
}
