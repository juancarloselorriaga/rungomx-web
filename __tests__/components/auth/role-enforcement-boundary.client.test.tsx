import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import RoleEnforcementBoundary from '@/components/auth/role-enforcement-boundary';

const replaceMock = jest.fn();
const refreshMock = jest.fn();
const mockUseSession = jest.fn();
const mockUsePathname = jest.fn();
const mockUseLocale = jest.fn();
const setProfileStatusOverrideMock = jest.fn();
const setNeedsRoleAssignmentOverrideMock = jest.fn();

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => mockUseLocale(),
}));

jest.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['es', 'en'],
    defaultLocale: 'en',
    pathnames: {
      '/admin': '/admin',
    },
  },
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
  }),
  usePathname: () => mockUsePathname(),
}));

jest.mock('@/lib/auth/client', () => ({
  useSession: () => mockUseSession(),
  signOut: jest.fn(),
}));

jest.mock('@/app/actions/roles', () => ({
  assignExternalRoles: jest.fn(),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/spinner', () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

jest.mock('@/components/auth/onboarding-context', () => ({
  useOnboardingOverrides: () => ({
    setProfileStatusOverride: setProfileStatusOverrideMock,
    setNeedsRoleAssignmentOverride: setNeedsRoleAssignmentOverrideMock,
  }),
}));

describe('RoleEnforcementBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocale.mockReturnValue('en');
    mockUsePathname.mockReturnValue('/en/dashboard/my-registrations');
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          isInternal: true,
          canonicalRoles: ['internal.staff'],
          needsRoleAssignment: false,
          availableExternalRoles: [],
          permissions: {
            canAccessAdminArea: true,
            canAccessUserArea: false,
            canManageUsers: false,
            canManageEvents: true,
            canViewStaffTools: true,
            canViewOrganizersDashboard: false,
            canViewAthleteDashboard: false,
          },
        },
        permissions: {
          canAccessAdminArea: true,
          canAccessUserArea: false,
          canManageUsers: false,
          canManageEvents: true,
          canViewStaffTools: true,
          canViewOrganizersDashboard: false,
          canViewAthleteDashboard: false,
        },
        canonicalRoles: ['internal.staff'],
        availableExternalRoles: [],
        needsRoleAssignment: false,
        isInternal: true,
      },
    });
  });

  it('redirects internal admin-area users from protected non-admin paths to the localized admin route', async () => {
    render(
      <RoleEnforcementBoundary>
        <div>protected content</div>
      </RoleEnforcementBoundary>,
    );

    expect(screen.getByText('protected content')).toBeInTheDocument();

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith({ pathname: '/admin' }, { locale: 'en' });
    });
  });

  it('does not redirect internal admin-area users already on the localized admin route', async () => {
    mockUsePathname.mockReturnValue('/admin/payments');

    render(
      <RoleEnforcementBoundary>
        <div>protected content</div>
      </RoleEnforcementBoundary>,
    );

    expect(screen.getByText('protected content')).toBeInTheDocument();

    await waitFor(() => {
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });
});
