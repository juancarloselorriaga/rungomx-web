import { getPathname, Link } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getAllOrganizations, getUserOrganizations } from '@/lib/organizations/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { ChevronRight, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { OrganizationsPageHeader } from './organizations-page-header';

type OrganizationListRole = 'support' | 'owner' | 'admin' | 'editor' | 'viewer';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/organizations',
    (messages) => messages.Pages?.DashboardOrganizations?.metadata,
    { robots: { index: false, follow: false } },
  );
}

export default async function DashboardOrganizationsPage({ params }: LocalePageProps) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/dashboard/organizations' });
  const t = await getTranslations('pages.dashboard.organizations');
  const authContext = await getAuthContext();

  // Access gate: organizers and internal staff only.
  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard ||
    authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  const isSupportUser = authContext.permissions.canManageEvents;
  const organizations = isSupportUser
    ? (await getAllOrganizations()).map((org) => ({ ...org, role: 'support' as const }))
    : await getUserOrganizations(authContext.user!.id);

  return (
    <div className="space-y-6">
      <OrganizationsPageHeader title={t('title')} description={t('description')} />

      {organizations.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 shadow-sm">
          <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
            <div className="rounded-full bg-muted p-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{t('emptyState.title')}</h2>
              <p className="text-muted-foreground max-w-md">{t('emptyState.description')}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {organizations.map((org) => {
            const role = (org as { role?: OrganizationListRole }).role ?? 'viewer';
            const roleLabel =
              role === 'support' ? t('roles.support') : t(`roles.${role as OrganizationListRole}`);

            return (
              <Link
                key={org.id}
                href={{ pathname: '/dashboard/organizations/[orgId]', params: { orgId: org.id } }}
                className="block rounded-lg border bg-card p-6 shadow-sm hover:border-primary/50 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{org.name}</h3>
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {roleLabel}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('table.slug')}: {org.slug}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
