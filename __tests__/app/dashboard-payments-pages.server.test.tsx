import DashboardPaymentsPage from '@/app/[locale]/(protected)/dashboard/payments/page';
import DashboardPaymentsPayoutDetailPage from '@/app/[locale]/(protected)/dashboard/payments/payouts/[payoutRequestId]/page';
import DashboardPaymentsPayoutsPage from '@/app/[locale]/(protected)/dashboard/payments/payouts/page';
import { getAuthContext } from '@/lib/auth/server';
import type { PermissionSet } from '@/lib/auth/roles';
import { getOrgMembership } from '@/lib/organizations/permissions';
import { getAllOrganizations, getUserOrganizations } from '@/lib/organizations/queries';
import {
  getOrganizerPayoutDetailByRequestId,
  listOrganizerPayouts,
} from '@/lib/payments/organizer/payout-views';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(async () => undefined),
}));

jest.mock('@/utils/seo', () => ({
  createLocalizedPageMetadata: jest.fn(),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async () => (key: string) => key),
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
  getUserOrganizations: jest.fn(),
}));

jest.mock('@/lib/organizations/permissions', () => ({
  getOrgMembership: jest.fn(),
}));

jest.mock('@/lib/payments/organizer/payout-views', () => ({
  listOrganizerPayouts: jest.fn(),
  getOrganizerPayoutDetailByRequestId: jest.fn(),
}));

jest.mock('@/components/payments/organizer-payments-workspace', () => ({
  OrganizerPaymentsWorkspace: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="workspace" data-organization-id={organizationId}>
      organizer-workspace
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
  PayoutHistoryTable: () => (
    <div data-testid="payout-history">
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
const mockGetUserOrganizations =
  getUserOrganizations as jest.MockedFunction<typeof getUserOrganizations>;
const mockGetOrgMembership = getOrgMembership as jest.MockedFunction<typeof getOrgMembership>;
const mockListOrganizerPayouts =
  listOrganizerPayouts as jest.MockedFunction<typeof listOrganizerPayouts>;
const mockGetOrganizerPayoutDetailByRequestId =
  getOrganizerPayoutDetailByRequestId as jest.MockedFunction<
    typeof getOrganizerPayoutDetailByRequestId
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
    mockListOrganizerPayouts.mockResolvedValue([]);
    mockGetOrgMembership.mockResolvedValue(null);
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
    expect(html).toContain('Organizer Org');
    expect(html).not.toContain('Staff Org');
    expect(html).toContain('data-organization-id="org-user-1"');
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
    expect(mockListOrganizerPayouts).toHaveBeenCalledWith({ organizerId: 'org-user-1' });
    expect(html).toContain('Organizer Org');
    expect(html).toContain('data-organization-id="org-user-1"');
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
    expect(mockListOrganizerPayouts).toHaveBeenCalledWith({ organizerId: 'org-staff-2' });
    expect(html).toContain('Staff Org One');
    expect(html).toContain('Staff Org Two');
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
    expect(html).toContain('data-testid="detail-telemetry"');
    expect(html).toContain('data-organization-id="org-user-1"');
    expect(html).toContain('/dashboard/payments/payouts?organizationId=org-user-1');
  });
});
