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
    '/admin',
    (messages) => messages.Pages?.Dashboard?.metadata,
    { robots: { index: false, follow: false } }
  );
}

export default async function AdminDashboardPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/admin' });
  const t = await getTranslations('pages.dashboard');
  const { permissions, canonicalRoles } = await getAuthContext();

  const isAdmin = permissions.canManageUsers;
  const title = isAdmin ? t('admin.title') : t('admin.staffTitle');
  const description = isAdmin ? t('admin.description') : t('admin.staffDescription');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-4">{title}</h1>
        <p className="text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold">{t('admin.permissionsTitle')}</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>{permissions.canAccessAdminArea ? t('admin.permissions.accessAdminArea') : t('admin.permissions.noAdminArea')}</li>
            <li>{permissions.canManageUsers ? t('admin.permissions.manageUsers') : t('admin.permissions.noManageUsers')}</li>
            <li>{permissions.canManageEvents ? t('admin.permissions.manageEvents') : t('admin.permissions.noManageEvents')}</li>
            <li>{permissions.canViewStaffTools ? t('admin.permissions.viewStaffTools') : t('admin.permissions.noStaffTools')}</li>
          </ul>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold">{t('admin.rolesTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {canonicalRoles.length > 0 ? canonicalRoles.join(', ') : t('admin.rolesEmpty')}
          </p>
        </div>
      </div>
    </div>
  );
}
