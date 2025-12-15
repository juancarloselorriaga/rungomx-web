import { AdminDashboardMetricsGrid } from '@/components/admin/dashboard/admin-dashboard-metrics';
import { getAdminDashboardMetrics } from '@/lib/admin-dashboard/metrics';
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
    { robots: { index: false, follow: false } },
  );
}

type AdminDashboardPageSearchParams = Record<string, string | string[] | undefined>;

type AdminDashboardPageProps = LocalePageProps & {
  searchParams?: Promise<AdminDashboardPageSearchParams>;
};

const DEFAULT_RANGE: '7d' | '14d' | '30d' = '30d';

function normalizeRange(rawRange: string | undefined): '7d' | '14d' | '30d' {
  if (rawRange === '7d' || rawRange === '14d' || rawRange === '30d') {
    return rawRange;
  }
  return DEFAULT_RANGE;
}

function rangeToDays(range: '7d' | '14d' | '30d'): number {
  switch (range) {
    case '7d':
      return 7;
    case '14d':
      return 14;
    case '30d':
    default:
      return 30;
  }
}

export default async function AdminDashboardPage({
  params,
  searchParams,
}: AdminDashboardPageProps) {
  await configPageLocale(params, { pathname: '/admin' });
  const t = await getTranslations('pages.dashboard');
  const { permissions } = await getAuthContext();

  const resolvedSearchParams: AdminDashboardPageSearchParams = searchParams
    ? await searchParams
    : {};

  const rangeParam = resolvedSearchParams.range;
  const rawRange =
    typeof rangeParam === 'string'
      ? rangeParam
      : Array.isArray(rangeParam)
        ? rangeParam[0]
        : undefined;
  const selectedRange = normalizeRange(rawRange);
  const metrics = await getAdminDashboardMetrics(rangeToDays(selectedRange));

  const isAdmin = permissions.canManageUsers;
  const title = isAdmin ? t('admin.title') : t('admin.staffTitle');
  const description = isAdmin ? t('admin.description') : t('admin.staffDescription');
  const profileCompletionPercent = Math.round(metrics.profiles.completionRate * 1000) / 10;

  const metricLabels = {
    sectionTitle: t('admin.metrics.sectionTitle'),
    sectionDescription: t('admin.metrics.sectionDescription'),
    users: {
      title: t('admin.metrics.users.title'),
      description: t('admin.metrics.users.description'),
      secondaryLabel: t('admin.metrics.users.totalLabel', {
        count: metrics.users.total,
      }),
    },
    profiles: {
      title: t('admin.metrics.profiles.title'),
      description: t('admin.metrics.profiles.description'),
      secondaryLabel: t('admin.metrics.profiles.completionLabel', {
        rate: profileCompletionPercent,
      }),
    },
    contactSubmissions: {
      title: t('admin.metrics.contactSubmissions.title'),
      description: t('admin.metrics.contactSubmissions.description'),
      fallbackSecondaryLabel: t('admin.metrics.contactSubmissions.totalLabel', {
        count: metrics.contactSubmissions.total,
      }),
      originsPrefix: t('admin.metrics.contactSubmissions.originsPrefix'),
    },
    registrationsByRole: {
      title: t('admin.metrics.registrationsByRole.title'),
      description: t('admin.metrics.registrationsByRole.description'),
      totalLabel: t('admin.metrics.registrationsByRole.totalLabel', {
        count: metrics.registrationsByRole.totalAssignments,
      }),
      roleLabels: {
        organizer: t('admin.metrics.registrationsByRole.roles.organizer'),
        athlete: t('admin.metrics.registrationsByRole.roles.athlete'),
        volunteer: t('admin.metrics.registrationsByRole.roles.volunteer'),
      },
    },
    operations: {
      feedbackRateTitle: t('admin.metrics.operations.feedbackRateTitle'),
      feedbackRateDescription: t('admin.metrics.operations.feedbackRateDescription'),
      feedbackRateLabel: t('admin.metrics.operations.feedbackRateLabel'),
      feedbackEntriesLabel: t('admin.metrics.operations.feedbackEntriesLabel', {
        count: metrics.contactSubmissions.total,
      }),
      usersLabel: t('admin.metrics.operations.usersLabel', {
        count: metrics.users.total,
      }),
    },
  };

  const rangeOptions = [
    { value: '7d' as const, label: t('admin.metrics.ranges.last7days') },
    { value: '14d' as const, label: t('admin.metrics.ranges.last14days') },
    { value: '30d' as const, label: t('admin.metrics.ranges.last30days') },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-4">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <AdminDashboardMetricsGrid
        metrics={metrics}
        labels={metricLabels}
        rangeOptions={rangeOptions}
        selectedRange={selectedRange}
      />
    </div>
  );
}
