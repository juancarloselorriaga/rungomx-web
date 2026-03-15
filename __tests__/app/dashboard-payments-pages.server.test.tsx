import DashboardPaymentsPage from '@/app/[locale]/(protected)/dashboard/payments/page';
import DashboardPaymentsPayoutDetailPage from '@/app/[locale]/(protected)/dashboard/payments/payouts/[payoutRequestId]/page';
import DashboardPaymentsPayoutsPage from '@/app/[locale]/(protected)/dashboard/payments/payouts/page';
import { getAuthContext } from '@/lib/auth/server';
import type { PermissionSet } from '@/lib/auth/roles';
import { getOrgMembership } from '@/lib/organizations/permissions';
import {
  getAllOrganizations,
  getOrganizationSummary,
  getUserOrganizations,
} from '@/lib/organizations/queries';
import {
  countOrganizerPayouts,
  getOrganizerPayoutDetailByRequestId,
  listOrganizerPayouts,
} from '@/lib/payments/organizer/payout-views';
import { loadOrganizerPaymentsWorkspaceData } from '@/lib/payments/organizer/workspace-data';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(async () => undefined),
}));

jest.mock('@/utils/seo', () => ({
  createLocalizedPageMetadata: jest.fn(),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    if (namespace === 'pages.dashboardPayments') {
      if (key === 'home.organization.count') {
        return `${values?.count} organizations available`;
      }
      if (key === 'actions.newPayout') {
        return 'Request payout';
      }
      if (key === 'detail.pageTitle') {
        return `Payout #${values?.id}`;
      }
      if (key === 'home.shell.loadingAriaLabel') {
        return 'Loading payments';
      }
      if (key === 'detail.loadingAriaLabel') {
        return 'Loading payout detail';
      }
      if (key === 'payouts.scopeSummary') {
        return `Showing ${values?.start}-${values?.end} of ${values?.total} payouts`;
      }
      if (key === 'payouts.pageStatus') {
        return `Page ${values?.page} of ${values?.pageCount}`;
      }
    }

    return key;
  }),
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href:
      | string
      | {
          pathname: string;
          params?: Record<string, string>;
          query?: Record<string, string>;
        };
    children: ReactNode;
  }) => {
    const resolvedHref =
      typeof href === 'string'
        ? href
        : `${Object.entries(href.params ?? {}).reduce(
            (pathname, [key, value]) => pathname.replace(`[${key}]`, value),
            href.pathname,
          )}${(() => {
            const query = new URLSearchParams(href.query ?? {}).toString();
            return query ? `?${query}` : '';
          })()}`;

    return (
      <a href={resolvedHref} {...props}>
        {children}
      </a>
    );
  },
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: {
    asChild?: boolean;
    children: ReactNode;
  }) => (asChild ? <>{children}</> : <button {...props}>{children}</button>),
}));

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/lib/organizations/queries', () => ({
  getAllOrganizations: jest.fn(),
  getOrganizationSummary: jest.fn(),
  getUserOrganizations: jest.fn(),
}));

jest.mock('@/lib/organizations/permissions', () => ({
  getOrgMembership: jest.fn(),
}));

jest.mock('@/lib/payments/organizer/payout-views', () => ({
  countOrganizerPayouts: jest.fn(),
  listOrganizerPayouts: jest.fn(),
  getOrganizerPayoutDetailByRequestId: jest.fn(),
}));

jest.mock('@/lib/payments/organizer/workspace-data', () => ({
  loadOrganizerPaymentsWorkspaceData: jest.fn(),
}));

jest.mock('@/components/payments/organizer-payments-workspace', () => ({
  OrganizerPaymentsWorkspace: ({
    organizationId,
    initialData,
  }: {
    organizationId: string;
    initialData?: unknown;
  }) => (
    <div
      data-testid="workspace"
      data-organization-id={organizationId}
      data-has-initial-data={String(initialData != null)}
    >
      organizer-workspace
    </div>
  ),
}));

jest.mock('@/components/payments/organizer-payments-context-card', () => ({
  OrganizerPaymentsContextCard: ({
    organizationCountLabel,
  }: {
    organizationCountLabel: string;
  }) => (
    <div data-testid="organization-context-card" data-organization-count-label={organizationCountLabel}>
      organization-context-card
    </div>
  ),
}));

jest.mock('@/components/payments/payout-request-dialog', () => ({
  PayoutRequestDialog: ({
    organizationId,
    triggerLabel,
  }: {
    organizationId: string;
    triggerLabel: string;
  }) => (
    <div
      data-testid="payout-request-dialog"
      data-organization-id={organizationId}
      data-trigger-label={triggerLabel}
    >
      payout-request-dialog
    </div>
  ),
}));

jest.mock('@/components/payments/payout-request-form', () => ({
  PayoutRequestForm: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="request-form" data-organization-id={organizationId}>
      payout-request-form
    </div>
  ),
}));

jest.mock('@/components/payments/payout-history-table', () => ({
  PayoutHistoryTable: ({
    scopeSummary,
    pageStatus,
  }: {
    scopeSummary?: string;
    pageStatus?: string;
  }) => (
    <div
      data-testid="payout-history"
      data-scope-summary={scopeSummary}
      data-page-status={pageStatus}
    >
      payout-history
    </div>
  ),
}));

jest.mock('@/components/payments/payout-detail-view-telemetry', () => ({
  PayoutDetailViewTelemetry: ({
    organizationId,
    payoutRequestId,
  }: {
    organizationId: string;
    payoutRequestId: string;
  }) => (
    <div
      data-testid="detail-telemetry"
      data-organization-id={organizationId}
      data-payout-request-id={payoutRequestId}
    />
  ),
}));

jest.mock('@/components/payments/payout-statement-action', () => ({
  PayoutStatementAction: ({
    organizationId,
    payoutRequestId,
    isTerminal,
  }: {
    organizationId: string;
    payoutRequestId: string;
    isTerminal: boolean;
  }) => (
    <div
      data-testid="statement-action"
      data-organization-id={organizationId}
      data-payout-request-id={payoutRequestId}
      data-is-terminal={String(isTerminal)}
    />
  ),
}));

jest.mock('@/components/payments/payout-lifecycle-rail', () => ({
  PayoutLifecycleRail: ({ locale }: { locale: string }) => (
    <div data-testid="lifecycle-rail" data-locale={locale}>
      payout-lifecycle-rail
    </div>
  ),
}));

const mockGetAuthContext = getAuthContext as jest.MockedFunction<typeof getAuthContext>;
const mockGetAllOrganizations = getAllOrganizations as jest.MockedFunction<typeof getAllOrganizations>;
const mockGetOrganizationSummary =
  getOrganizationSummary as jest.MockedFunction<typeof getOrganizationSummary>;
const mockGetUserOrganizations =
  getUserOrganizations as jest.MockedFunction<typeof getUserOrganizations>;
const mockGetOrgMembership = getOrgMembership as jest.MockedFunction<typeof getOrgMembership>;
const mockListOrganizerPayouts =
  listOrganizerPayouts as jest.MockedFunction<typeof listOrganizerPayouts>;
const mockCountOrganizerPayouts =
  countOrganizerPayouts as jest.MockedFunction<typeof countOrganizerPayouts>;
const mockGetOrganizerPayoutDetailByRequestId =
  getOrganizerPayoutDetailByRequestId as jest.MockedFunction<
    typeof getOrganizerPayoutDetailByRequestId
  >;
const mockLoadOrganizerPaymentsWorkspaceData =
  loadOrganizerPaymentsWorkspaceData as jest.MockedFunction<
    typeof loadOrganizerPaymentsWorkspaceData
  >;

const basePermissions: PermissionSet = {
  canAccessAdminArea: false,
  canAccessUserArea: true,
  canManageUsers: false,
  canManageEvents: false,
  canViewStaffTools: false,
  canViewOrganizersDashboard: false,
  canViewAthleteDashboard: false,
};

describe('dashboard payments pages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCountOrganizerPayouts.mockResolvedValue(0);
    mockListOrganizerPayouts.mockResolvedValue([]);
    mockGetOrgMembership.mockResolvedValue(null);
    mockGetOrganizationSummary.mockResolvedValue(null);
    mockLoadOrganizerPaymentsWorkspaceData.mockResolvedValue(null);
  });

  it('uses user organizations for external organizers on the payments home page', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user' },
      permissions: {
        ...basePermissions,
        canManageEvents: true,
        canViewOrganizersDashboard: true,
      },
    } as Awaited<ReturnType<typeof getAuthContext>>);

    mockGetUserOrganizations.mockResolvedValue([
      {
        id: 'org-user-1',
        name: 'Organizer Org',
        slug: 'organizer-org',
        role: 'owner',
      },
    ] as Awaited<ReturnType<typeof getUserOrganizations>>);
    mockGetAllOrganizations.mockResolvedValue([
      {
        id: 'org-staff-1',
        name: 'Staff Org',
        slug: 'staff-org',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]);

    const page = await DashboardPaymentsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(page);

    expect(mockGetUserOrganizations).toHaveBeenCalledWith('organizer-user');
    expect(mockGetAllOrganizations).not.toHaveBeenCalled();
    expect(mockLoadOrganizerPaymentsWorkspaceData).toHaveBeenCalledWith({
      authContext: expect.objectContaining({
        user: { id: 'organizer-user' },
      }),
      organizationId: 'org-user-1',
    });
    expect(html).toContain('data-organization-count-label="1 organizations available"');
    expect(html).not.toContain('Staff Org');
    expect(html).toContain('data-organization-id="org-user-1"');
    expect(html).toContain('data-has-initial-data="false"');
    expect(html.indexOf('data-testid="workspace"')).toBeLessThan(
      html.indexOf('data-testid="organization-context-card"'),
    );
  });

  it('uses user organizations for external organizers on the payouts page', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user' },
      permissions: {
        ...basePermissions,
        canManageEvents: true,
        canViewOrganizersDashboard: true,
      },
    } as Awaited<ReturnType<typeof getAuthContext>>);

    mockGetUserOrganizations.mockResolvedValue([
      {
        id: 'org-user-1',
        name: 'Organizer Org',
        slug: 'organizer-org',
        role: 'owner',
      },
    ] as Awaited<ReturnType<typeof getUserOrganizations>>);

    const page = await DashboardPaymentsPayoutsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ organizationId: 'org-user-1' }),
    });
    const html = renderToStaticMarkup(page);

    expect(mockGetUserOrganizations).toHaveBeenCalledWith('organizer-user');
    expect(mockGetAllOrganizations).not.toHaveBeenCalled();
    expect(mockCountOrganizerPayouts).toHaveBeenCalledWith({ organizerId: 'org-user-1' });
    expect(mockListOrganizerPayouts).toHaveBeenCalledWith({
      organizerId: 'org-user-1',
      limit: 25,
      offset: 0,
    });
    expect(html).toContain('data-organization-count-label="1 organizations available"');
    expect(html).toContain('data-organization-id="org-user-1"');
    expect(html).toContain('data-trigger-label="Request payout"');
    expect(html).toContain('data-scope-summary="Showing 0-0 of 0 payouts"');
    expect(html).toContain('data-page-status="Page 0 of 0"');
    expect(html.indexOf('data-testid="payout-history"')).toBeLessThan(
      html.indexOf('data-testid="organization-context-card"'),
    );
  });

  it('uses all organizations only for staff users on the payouts page', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'staff-user' },
      permissions: {
        ...basePermissions,
        canAccessAdminArea: true,
        canManageEvents: true,
        canViewStaffTools: true,
      },
    } as Awaited<ReturnType<typeof getAuthContext>>);

    mockGetAllOrganizations.mockResolvedValue([
      {
        id: 'org-staff-1',
        name: 'Staff Org One',
        slug: 'staff-org-one',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
      {
        id: 'org-staff-2',
        name: 'Staff Org Two',
        slug: 'staff-org-two',
        createdAt: new Date('2026-03-02T00:00:00Z'),
      },
    ]);

    const page = await DashboardPaymentsPayoutsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ organizationId: 'org-staff-2' }),
    });
    const html = renderToStaticMarkup(page);

    expect(mockGetAllOrganizations).toHaveBeenCalled();
    expect(mockGetUserOrganizations).not.toHaveBeenCalled();
    expect(mockCountOrganizerPayouts).toHaveBeenCalledWith({ organizerId: 'org-staff-2' });
    expect(mockListOrganizerPayouts).toHaveBeenCalledWith({
      organizerId: 'org-staff-2',
      limit: 25,
      offset: 0,
    });
    expect(html).toContain('data-organization-count-label="2 organizations available"');
    expect(html).toContain('data-organization-id="org-staff-2"');
  });

  it('derives payout detail organization from the payout request id', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'organizer-user' },
      permissions: {
        ...basePermissions,
        canManageEvents: true,
        canViewOrganizersDashboard: true,
      },
    } as Awaited<ReturnType<typeof getAuthContext>>);

    mockGetOrganizerPayoutDetailByRequestId.mockResolvedValue({
      payoutRequestId: 'payout-123',
      organizerId: 'org-user-1',
      status: 'completed',
      traceId: 'trace-1',
      currency: 'MXN',
      requestedAt: new Date('2026-03-01T12:00:00Z'),
      requestedAmountMinor: 125000,
      currentRequestedAmountMinor: 125000,
      maxWithdrawableAmountMinor: 200000,
      includedAmountMinor: 125000,
      deductionAmountMinor: 0,
      lifecycleEvents: [],
      isTerminal: true,
    });
    mockGetOrgMembership.mockResolvedValue({
      organizationId: 'org-user-1',
      role: 'owner',
      organizationName: 'Organizer Org',
      organizationSlug: 'organizer-org',
    });

    const page = await DashboardPaymentsPayoutDetailPage({
      params: Promise.resolve({ locale: 'en', payoutRequestId: 'payout-123' }),
    });
    const html = renderToStaticMarkup(page);

    expect(mockGetOrganizerPayoutDetailByRequestId).toHaveBeenCalledWith('payout-123');
    expect(mockGetOrgMembership).toHaveBeenCalledWith('organizer-user', 'org-user-1');
    expect(mockGetOrganizationSummary).toHaveBeenCalledWith('org-user-1');
    expect(html).toContain('data-testid="detail-telemetry"');
    expect(html).toContain('data-organization-id="org-user-1"');
    expect(html).toContain('/dashboard/payments/payouts?organizationId=org-user-1');
    expect(html).toContain('Payout #payout-1');
  });
});
