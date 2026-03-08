import { Link } from '@/i18n/navigation';
import { OrganizerPaymentsContextCard } from '@/components/payments/organizer-payments-context-card';
import { OrganizerPaymentsWorkspace } from '@/components/payments/organizer-payments-workspace';
import { getAuthContext } from '@/lib/auth/server';
import { getAllOrganizations, getUserOrganizations } from '@/lib/organizations/queries';
import { Button } from '@/components/ui/button';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/payments',
    (messages) => messages.Pages?.DashboardPayments?.metadata,
    { robots: { index: false, follow: false } },
  );
}

type DashboardPaymentsSearchParams = Record<string, string | string[] | undefined>;

type DashboardPaymentsPageProps = LocalePageProps & {
  searchParams?: Promise<DashboardPaymentsSearchParams>;
};

function readSingleSearchValue(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? '';
  return '';
}

export default async function DashboardPaymentsPage({
  params,
  searchParams,
}: DashboardPaymentsPageProps) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/dashboard/payments' });

  const t = await getTranslations('pages.dashboardPayments');
  const authContext = await getAuthContext();

  const organizations = authContext.permissions.canViewStaffTools
    ? await getAllOrganizations()
    : await getUserOrganizations(authContext.user!.id);

  if (organizations.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">{t('home.title')}</h1>
          <p className="text-muted-foreground">{t('home.description')}</p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('home.shell.emptyTitle')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('home.shell.emptyDescription')}</p>
        </div>
      </div>
    );
  }

  const resolvedSearchParams: DashboardPaymentsSearchParams = searchParams
    ? await searchParams
    : {};
  const requestedOrganizationId = readSingleSearchValue(resolvedSearchParams.organizationId).trim();

  const selectedOrganization =
    organizations.find((organization) => organization.id === requestedOrganizationId) ??
    organizations[0];
  const organizationCountLabel =
    locale === 'es'
      ? `${organizations.length} ${organizations.length === 1 ? 'organización disponible' : 'organizaciones disponibles'}`
      : `${organizations.length} ${organizations.length === 1 ? 'organization available' : 'organizations available'}`;

  const hasInvalidSelection =
    requestedOrganizationId.length > 0 &&
    !organizations.some((organization) => organization.id === requestedOrganizationId);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">{t('home.title')}</h1>
        <p className="text-muted-foreground">{t('home.description')}</p>
      </div>

      <OrganizerPaymentsContextCard
        pathname="/dashboard/payments"
        organizations={organizations}
        selectedOrganization={selectedOrganization}
        title={t('home.organization.title')}
        description={t('home.organization.help')}
        selectorLabel={t('home.organization.label')}
        organizationCountLabel={organizationCountLabel}
        currentOrganizationLabel={locale === 'es' ? 'Actual' : 'Current'}
      />

      {hasInvalidSelection ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('home.organization.invalidTitle')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('home.organization.invalidDescription')}
          </p>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link
                href={{
                  pathname: '/dashboard/payments',
                  query: { organizationId: selectedOrganization.id },
                }}
              >
                {t('actions.retry')}
              </Link>
            </Button>
          </div>
        </section>
      ) : null}

      <OrganizerPaymentsWorkspace
        locale={locale as 'es' | 'en'}
        organizationId={selectedOrganization.id}
        organizationName={selectedOrganization.name}
      />
    </div>
  );
}
