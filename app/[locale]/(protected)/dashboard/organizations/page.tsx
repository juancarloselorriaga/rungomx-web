import { DashboardSectionSurface } from '@/components/dashboard/dashboard-section-surface';
import { InsetSurface, MutedSurface } from '@/components/ui/surface';
import { getPathname, Link } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getAllOrganizations, getUserOrganizations } from '@/lib/organizations/queries';
import { cn } from '@/lib/utils';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { Building2, Calendar, ChevronRight, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { OrganizationsPageHeader } from './organizations-page-header';

type OrganizationListRole = 'support' | 'owner' | 'admin' | 'editor' | 'viewer';

const roleStyles: Record<OrganizationListRole, string> = {
  support: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-100',
  owner: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100',
  admin: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100',
  editor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100',
  viewer: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

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
    authContext.permissions.canViewOrganizersDashboard || authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  const isSupportUser = authContext.permissions.canViewStaffTools;
  const organizations = isSupportUser
    ? (await getAllOrganizations()).map((org) => ({ ...org, role: 'support' as const }))
    : await getUserOrganizations(authContext.user!.id);

  return (
    <div className="space-y-6">
      <OrganizationsPageHeader
        title={t('title')}
        description={t('description')}
        totalOrganizations={organizations.length}
        isSupportUser={isSupportUser}
      />

      {organizations.length === 0 ? (
        <DashboardSectionSurface
          title={t('emptyState.title')}
          description={t('emptyState.description')}
        >
          <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center">
            <div className="rounded-full bg-muted p-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
        </DashboardSectionSurface>
      ) : (
        <div className="space-y-4" data-motion="settle">
          {organizations.map((org, index) => {
            const role = (org as { role?: OrganizationListRole }).role ?? 'viewer';
            const roleLabel =
              role === 'support' ? t('roles.support') : t(`roles.${role as OrganizationListRole}`);

            return (
              <Link
                key={org.id}
                href={{ pathname: '/dashboard/organizations/[orgId]', params: { orgId: org.id } }}
                className="motion-hover-lift group block overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-primary/50 hover:shadow-md"
                data-motion-item
                style={{ '--motion-index': index } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-gradient-to-br from-primary/20 via-muted/80 to-background">
                        <Building2 className="size-5 text-muted-foreground" />
                      </div>

                      <h3 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
                        {org.name}
                      </h3>

                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          roleStyles[role],
                        )}
                      >
                        {roleLabel}
                      </span>
                    </div>

                    <InsetSurface className="grid gap-2 border-border/60 bg-muted/25 sm:grid-cols-2">
                      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4 shrink-0" />
                        <span className="truncate">{roleLabel}</span>
                      </div>

                      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4 shrink-0" />
                        <time dateTime={org.createdAt.toISOString()}>
                          {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                            org.createdAt,
                          )}
                        </time>
                      </div>
                    </InsetSurface>

                    <MutedSurface className="px-3 py-2 text-sm text-muted-foreground">
                      {t('table.slug')}: {org.slug}
                    </MutedSurface>
                  </div>

                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
