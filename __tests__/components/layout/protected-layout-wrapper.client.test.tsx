import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';

import ProtectedLayoutWrapper from '@/components/layout/protected-layout-wrapper';

const mockUseLocaleSyncOnAuth = jest.fn();

jest.mock('@/hooks/use-locale-sync-on-auth', () => ({
  useLocaleSyncOnAuth: (...args: unknown[]) => mockUseLocaleSyncOnAuth(...args),
}));

jest.mock('@/components/auth/onboarding-context', () => ({
  OnboardingOverridesProvider: ({ children }: PropsWithChildren) => (
    <div data-testid="onboarding-provider">{children}</div>
  ),
}));

jest.mock('@/components/pro-features/pro-features-provider', () => ({
  ProFeaturesProvider: ({ children }: PropsWithChildren) => (
    <div data-testid="pro-features-provider">{children}</div>
  ),
}));

jest.mock('@/components/auth/role-enforcement-boundary', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="role-enforcement-boundary">{children}</div>
  ),
}));

jest.mock('@/components/profile/profile-enforcement-boundary', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="profile-enforcement-boundary">{children}</div>
  ),
}));

describe('ProtectedLayoutWrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('suppresses the protected subtree while locale normalization is pending', () => {
    mockUseLocaleSyncOnAuth.mockReturnValue({
      preferredLocale: 'es',
      isLocaleRedirectPending: true,
    });

    render(
      <ProtectedLayoutWrapper initialPreferredLocale="es">
        <div>protected-child</div>
      </ProtectedLayoutWrapper>,
    );

    expect(screen.getByTestId('protected-layout-locale-redirect')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-layout-subtree')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pro-features-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('role-enforcement-boundary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-enforcement-boundary')).not.toBeInTheDocument();
    expect(screen.queryByText('protected-child')).not.toBeInTheDocument();
  });

  it('renders the protected subtree exactly once when locale normalization is not pending', () => {
    mockUseLocaleSyncOnAuth.mockReturnValue({
      preferredLocale: 'es',
      isLocaleRedirectPending: false,
    });

    render(
      <ProtectedLayoutWrapper initialPreferredLocale="es">
        <div>protected-child</div>
      </ProtectedLayoutWrapper>,
    );

    expect(screen.queryByTestId('protected-layout-locale-redirect')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('protected-layout-subtree')).toHaveLength(1);
    expect(screen.getByTestId('onboarding-provider')).toBeInTheDocument();
    expect(screen.getByTestId('pro-features-provider')).toBeInTheDocument();
    expect(screen.getByTestId('role-enforcement-boundary')).toBeInTheDocument();
    expect(screen.getByTestId('profile-enforcement-boundary')).toBeInTheDocument();
    expect(screen.getByText('protected-child')).toBeInTheDocument();
  });
});
