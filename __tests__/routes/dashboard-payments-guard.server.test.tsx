import DashboardPaymentsLayout from '@/app/[locale]/(protected)/dashboard/payments/layout';
import { getAuthContext } from '@/lib/auth/server';
import type { PermissionSet } from '@/lib/auth/roles';

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/i18n/navigation', () => ({
  getPathname: jest.fn(({ href, locale }: { href: string; locale: string }) => `/${locale}${href}`),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: jest.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

const mockGetAuthContext = getAuthContext as jest.MockedFunction<typeof getAuthContext>;

const basePermissions: PermissionSet = {
  canAccessAdminArea: false,
  canAccessUserArea: true,
  canManageUsers: false,
  canManageEvents: false,
  canViewStaffTools: false,
  canViewOrganizersDashboard: false,
  canViewAthleteDashboard: false,
};

const buildParams = (locale: 'es' | 'en' = 'en') => Promise.resolve({ locale });

describe('Organizer payments route guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects users without organizer/staff permissions back to dashboard', async () => {
    mockGetAuthContext.mockResolvedValue({
      permissions: basePermissions,
    } as Awaited<ReturnType<typeof getAuthContext>>);

    await expect(
      DashboardPaymentsLayout({
        children: <div>Payments</div>,
        params: buildParams('en'),
      }),
    ).rejects.toThrow('REDIRECT:/en/dashboard');
  });

  it('allows organizer users to access dashboard payments routes', async () => {
    const children = <div>Payments</div>;

    mockGetAuthContext.mockResolvedValue({
      permissions: {
        ...basePermissions,
        canViewOrganizersDashboard: true,
      },
    } as Awaited<ReturnType<typeof getAuthContext>>);

    const result = await DashboardPaymentsLayout({
      children,
      params: buildParams('en'),
    });

    expect(result).toBe(children);
  });
});
