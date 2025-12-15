import '@testing-library/jest-dom';
import { requestPasswordReset } from '@/lib/auth/actions';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ForgotPasswordForm } from './forgot-password-form';

const pushMock = jest.fn();

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('@/lib/auth/actions', () => ({
  requestPasswordReset: jest.fn(),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits email and redirects on success', async () => {
    (requestPasswordReset as jest.Mock).mockResolvedValue({
      data: { ok: true },
      error: null,
    });

    render(<ForgotPasswordForm />);

    const emailInput = screen.getByRole('textbox', { name: /email/i });
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    const submitButton = screen.getByRole('button', { name: /sendResetLink/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith('/forgot-password/success');
    });

    const [[emailArg, redirectToArg]] = (requestPasswordReset as jest.Mock).mock.calls;
    expect(emailArg).toBe('user@example.com');
    expect(redirectToArg).toContain('/reset-password');
  });

  it('shows backend error message when the server action returns an error', async () => {
    (requestPasswordReset as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'Backend failure' },
    });

    render(<ForgotPasswordForm />);

    const emailInput = screen.getByRole('textbox', { name: /email/i });
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    const submitButton = screen.getByRole('button', { name: /sendResetLink/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Backend failure')).toBeInTheDocument();
    });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it('falls back to a generic error message when the server action error has no message', async () => {
    (requestPasswordReset as jest.Mock).mockResolvedValue({
      data: null,
      error: {} as { message?: string },
    });

    render(<ForgotPasswordForm />);

    const emailInput = screen.getByRole('textbox', { name: /email/i });
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    const submitButton = screen.getByRole('button', { name: /sendResetLink/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('genericError')).toBeInTheDocument();
    });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows a generic error message when the server action throws', async () => {
    (requestPasswordReset as jest.Mock).mockRejectedValue(new Error('Network down'));

    render(<ForgotPasswordForm />);

    const emailInput = screen.getByRole('textbox', { name: /email/i });
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    const submitButton = screen.getByRole('button', { name: /sendResetLink/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('genericError')).toBeInTheDocument();
    });

    expect(pushMock).not.toHaveBeenCalled();
  });
});
