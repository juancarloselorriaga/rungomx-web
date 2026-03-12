import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { OrganizerPaymentsContextCard } from '@/components/payments/organizer-payments-context-card';
import { PaymentsStatePanel } from '@/components/payments/payments-state-panel';
import { PayoutHistoryTable } from '@/components/payments/payout-history-table';
import { PayoutRequestDialog } from '@/components/payments/payout-request-dialog';
import { getAuthContext } from '@/lib/auth/server';
import { getAllOrganizations, getUserOrganizations } from '@/lib/organizations/queries';
import {
  countOrganizerPayouts,
  listOrganizerPayouts,
} from '@/lib/payments/organizer/payout-views';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/payments/payouts',
    (messages) => messages.Pages?.DashboardPayments?.metadata,
    { robots: { index: false, follow: false } },
  );
}

type DashboardPaymentsPayoutsSearchParams = Record<string, string | string[] | undefined>;

type DashboardPaymentsPayoutsPageProps = LocalePageProps & {
  searchParams?: Promise<DashboardPaymentsPayoutsSearchParams>;
};

function readSingleSearchValue(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? '';
  return '';
}

function normalizePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export default async function DashboardPaymentsPayoutsPage({
  params,
  searchParams,
}: DashboardPaymentsPayoutsPageProps) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/dashboard/payments/payouts' });
  const t = await getTranslations('pages.dashboardPayments');

  const authContext = await getAuthContext();

  const organizations = authContext.permissions.canViewStaffTools
    ? await getAllOrganizations()
    : await getUserOrganizations(authContext.user!.id);

  if (organizations.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">{t('payouts.title')}</h1>
          <p className="text-muted-foreground">{t('payouts.description')}</p>
        </div>

        <PaymentsStatePanel
          title={t('home.shell.emptyTitle')}
          description={t('home.shell.emptyDescription')}
          dashed
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard/payments">{t('nav.backToPayments')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const resolvedSearchParams: DashboardPaymentsPayoutsSearchParams = searchParams
    ? await searchParams
    : {};
  const requestedOrganizationId = readSingleSearchValue(resolvedSearchParams.organizationId).trim();
  const requestedPage = normalizePositiveInt(
    readSingleSearchValue(resolvedSearchParams.page).trim(),
    1,
  );

  const selectedOrganization =
    organizations.find((organization) => organization.id === requestedOrganizationId) ??
    organizations[0];
  const organizationCountLabel = t('home.organization.count', { count: organizations.length });

  const hasInvalidSelection =
    requestedOrganizationId.length > 0 &&
    !organizations.some((organization) => organization.id === requestedOrganizationId);

  const payoutPageSize = 25;
  const payoutTotal = await countOrganizerPayouts({
    organizerId: selectedOrganization.id,
  });
  const payoutPageCount = payoutTotal === 0 ? 0 : Math.ceil(payoutTotal / payoutPageSize);
  const payoutPage = payoutPageCount === 0 ? 1 : Math.min(requestedPage, payoutPageCount);
  const payoutOffset = (payoutPage - 1) * payoutPageSize;
  const payouts = await listOrganizerPayouts({
    organizerId: selectedOrganization.id,
    limit: payoutPageSize,
    offset: payoutOffset,
  });
  const payoutStart = payoutTotal === 0 ? 0 : payoutOffset + 1;
  const payoutEnd = payoutTotal === 0 ? 0 : Math.min(payoutTotal, payoutOffset + payouts.length);

  function buildPayoutHistoryHref(page: number): {
    pathname: '/dashboard/payments/payouts';
    query: Record<string, string>;
  } {
    return {
      pathname: '/dashboard/payments/payouts',
      query: {
        organizationId: selectedOrganization.id,
        page: String(page),
      },
    };
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href={{
            pathname: '/dashboard/payments',
            query: { organizationId: selectedOrganization.id },
          }}
          className="inline-flex text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          {t('nav.backToPayments')}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold">{t('payouts.title')}</h1>
            <p className="text-muted-foreground">{t('payouts.description')}</p>
          </div>
          <PayoutRequestDialog
            organizationId={selectedOrganization.id}
            triggerLabel={t('actions.newPayout')}
          />
        </div>
      </div>

      {hasInvalidSelection ? (
        <PaymentsStatePanel
          title={t('home.organization.invalidTitle')}
          description={t('home.organization.invalidDescription')}
          tone="warning"
          action={
            <Button asChild variant="outline">
              <Link
                href={{
                  pathname: '/dashboard/payments/payouts',
                  query: { organizationId: selectedOrganization.id },
                }}
              >
                {t('actions.retry')}
              </Link>
            </Button>
          }
        />
      ) : null}

      <PayoutHistoryTable
        items={payouts}
        locale={locale as 'es' | 'en'}
        title={t('payouts.historyTitle')}
        description={t('payouts.historyDescription')}
        scopeSummary={t('payouts.scopeSummary', {
          start: payoutStart,
          end: payoutEnd,
          total: payoutTotal,
        })}
        scopeHint={t('payouts.scopeHint', {
          pageSize: payoutPageSize,
        })}
        pageStatus={t('payouts.pageStatus', {
          page: payoutPageCount === 0 ? 0 : payoutPage,
          pageCount: payoutPageCount,
        })}
        firstPageHref={payoutPage > 1 ? buildPayoutHistoryHref(1) : null}
        previousPageHref={payoutPage > 1 ? buildPayoutHistoryHref(payoutPage - 1) : null}
        nextPageHref={
          payoutPage < payoutPageCount ? buildPayoutHistoryHref(payoutPage + 1) : null
        }
        lastPageHref={
          payoutPageCount > 0 && payoutPage < payoutPageCount
            ? buildPayoutHistoryHref(payoutPageCount)
            : null
        }
        firstPageLabel={t('payouts.firstPageLabel')}
        previousPageLabel={t('payouts.previousPageLabel')}
        nextPageLabel={t('payouts.nextPageLabel')}
        lastPageLabel={t('payouts.lastPageLabel')}
      />

      <OrganizerPaymentsContextCard
        pathname="/dashboard/payments/payouts"
        organizations={organizations}
        selectedOrganization={selectedOrganization}
        title={t('home.organization.title')}
        description={t('home.organization.help')}
        selectorLabel={t('home.organization.label')}
        organizationCountLabel={organizationCountLabel}
      />
    </div>
  );
}
