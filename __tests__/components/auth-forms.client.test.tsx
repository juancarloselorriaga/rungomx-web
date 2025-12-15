import { SignInForm } from '@/components/auth/sign-in-form';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Avoid loading next-intl's ESM routing bundle in tests by mocking defineRouting
jest.mock('next-intl/routing', () => ({
  defineRouting: jest.fn(() => ({
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed',
    pathnames: {},
  })),
}));

const routerPushMock = jest.fn();
const routerRefreshMock = jest.fn();

jest.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    ...props
  }: React.PropsWithChildren<React.AnchorHTMLAttributes<HTMLAnchorElement>>) => (
    // eslint-disable-next-line jsx-a11y/anchor-has-content
    <a {...props}>{children}</a>
  ),
  useRouter: () => ({
    push: routerPushMock,
    refresh: routerRefreshMock,
  }),
}));

const signInEmailMock = jest.fn();
const signInSocialMock = jest.fn();
const signUpEmailMock = jest.fn();

jest.mock('@/lib/auth/client', () => ({
  signIn: {
    email: (...args: unknown[]) => signInEmailMock(...args),
    social: (...args: unknown[]) => signInSocialMock(...args),
  },
  signUp: {
    email: (...args: unknown[]) => signUpEmailMock(...args),
  },
  useSession: jest.fn(),
}));

describe('Auth forms verify-email flows', () => {
  beforeEach(() => {
    routerPushMock.mockReset();
    routerRefreshMock.mockReset();
    signInEmailMock.mockReset();
    signInSocialMock.mockReset();
    signUpEmailMock.mockReset();
  });

  it('routes to /verify-email with email and callbackURL when sign-in gets a 403 unverified error', async () => {
    signInEmailMock.mockResolvedValue({
      error: { status: 403, message: 'Email not verified' },
    });

    render(<SignInForm callbackPath="/dashboard" />);

    const emailInput = screen.getByPlaceholderText('you@example.com') as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    const submitButton = screen.getByRole('button', { name: /signIn/i });

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalled();
    });

    expect(routerRefreshMock).toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith({
      pathname: '/verify-email',
      query: {
        email: 'user@example.com',
        callbackURL: '/dashboard',
      },
    });
  });

  it('routes to /verify-email with email and callbackURL when sign-up detects existing account', async () => {
    signUpEmailMock.mockResolvedValue({
      error: { status: 409, message: 'Account already exists' },
    });

    render(<SignUpForm callbackPath="/dashboard" />);

    const nameInput = screen.getByPlaceholderText('namePlaceholder') as HTMLInputElement;
    const emailInput = screen.getByPlaceholderText('you@example.com') as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    const submitButton = screen.getByRole('button', { name: /createAccount/i });

    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalled();
    });

    expect(routerRefreshMock).toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith({
      pathname: '/verify-email',
      query: {
        email: 'user@example.com',
        callbackURL: '/dashboard',
      },
    });
  });
});
