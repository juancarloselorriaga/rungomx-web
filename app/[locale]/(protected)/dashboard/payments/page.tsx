import { Link } from '@/i18n/navigation';
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

  const hasInvalidSelection =
    requestedOrganizationId.length > 0 &&
    !organizations.some((organization) => organization.id === requestedOrganizationId);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">{t('home.title')}</h1>
        <p className="text-muted-foreground">{t('home.description')}</p>
      </div>

      <section className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{t('home.organization.label')}</h2>
          <p className="text-sm text-muted-foreground">{t('home.organization.help')}</p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label={t('home.organization.label')}>
          {organizations.map((organization) => {
            const isSelected = organization.id === selectedOrganization.id;

            return (
              <Button key={organization.id} asChild variant={isSelected ? 'default' : 'outline'}>
                <Link
                  href={{
                    pathname: '/dashboard/payments',
                    query: { organizationId: organization.id },
                  }}
                >
                  {organization.name}
                </Link>
              </Button>
            );
          })}
        </div>
      </section>

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

      <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
        <h2 className="text-lg font-semibold">{selectedOrganization.name}</h2>
        <p className="text-sm text-muted-foreground">{selectedOrganization.slug}</p>
      </section>

      <OrganizerPaymentsWorkspace
        locale={locale as 'es' | 'en'}
        organizationId={selectedOrganization.id}
      />
    </div>
  );
}
