import { UserDeleteDialog } from '@/components/admin/users/user-delete-dialog';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const deleteInternalUserMock = jest.fn();
jest.mock('@/app/actions/admin-users-delete', () => ({
  deleteInternalUser: (...args: unknown[]) => deleteInternalUserMock(...args),
}));

const toastErrorMock = jest.fn();
const toastSuccessMock = jest.fn();
jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${key}:${JSON.stringify(params)}`;
    }
    return key;
  },
}));

describe('UserDeleteDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChangeAction: jest.fn(),
    userId: 'user-123',
    userName: 'John Doe',
    userEmail: 'john@example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders dialog when open=true', () => {
      render(<UserDeleteDialog {...defaultProps} />);

      expect(screen.getByText('title')).toBeInTheDocument();
    });

    it('does not render dialog when open=false', () => {
      render(<UserDeleteDialog {...defaultProps} open={false} />);

      expect(screen.queryByText('title')).not.toBeInTheDocument();
    });

    it('displays user name and email', () => {
      render(<UserDeleteDialog {...defaultProps} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });

    it('displays warning message', () => {
      render(<UserDeleteDialog {...defaultProps} />);

      expect(screen.getByText('warning.title')).toBeInTheDocument();
      expect(screen.getByText('warning.description')).toBeInTheDocument();
    });

    it('renders password input field', () => {
      render(<UserDeleteDialog {...defaultProps} />);

      expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    });

    it('displays fallback text when userName is empty', () => {
      render(<UserDeleteDialog {...defaultProps} userName="" />);

      expect(screen.getByText('userInfo.unnamedUser')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onOpenChangeAction when cancel clicked', () => {
      const onOpenChange = jest.fn();
      render(<UserDeleteDialog {...defaultProps} onOpenChangeAction={onOpenChange} />);

      fireEvent.click(screen.getByText('buttons.cancel'));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('shows validation error for empty password', () => {
      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      expect(screen.getByText('fields.password.required')).toBeInTheDocument();
      expect(deleteInternalUserMock).not.toHaveBeenCalled();
    });

    it('disables delete button while pending', async () => {
      deleteInternalUserMock.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), {
        target: { value: 'password' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      // The delete button shows aria-busy when loading
      await waitFor(() => {
        const busyButton = document.querySelector('button[aria-busy="true"]');
        expect(busyButton).toBeDisabled();
      });
    });

    it('disables password input while pending', async () => {
      deleteInternalUserMock.mockImplementation(() => new Promise(() => {}));

      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), {
        target: { value: 'password' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('••••••••')).toBeDisabled();
      });
    });

    it('clears form state when dialog closes', () => {
      const { rerender } = render(<UserDeleteDialog {...defaultProps} />);

      // Enter password and trigger error
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));
      expect(screen.getByText('fields.password.required')).toBeInTheDocument();

      // Close and reopen dialog
      rerender(<UserDeleteDialog {...defaultProps} open={false} />);
      rerender(<UserDeleteDialog {...defaultProps} open={true} />);

      // Error should be cleared
      expect(screen.queryByText('fields.password.required')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays UNAUTHENTICATED error and shows toast', async () => {
      deleteInternalUserMock.mockResolvedValueOnce({ ok: false, error: 'UNAUTHENTICATED' });

      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(screen.getByText('errors.unauthenticated')).toBeInTheDocument();
      });
      expect(toastErrorMock).toHaveBeenCalledWith('errors.unauthenticated');
    });

    it('displays FORBIDDEN error and shows toast', async () => {
      deleteInternalUserMock.mockResolvedValueOnce({ ok: false, error: 'FORBIDDEN' });

      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(screen.getByText('errors.forbidden')).toBeInTheDocument();
      });
      expect(toastErrorMock).toHaveBeenCalledWith('errors.forbidden');
    });

    it('displays CANNOT_DELETE_SELF error and shows toast', async () => {
      deleteInternalUserMock.mockResolvedValueOnce({ ok: false, error: 'CANNOT_DELETE_SELF' });

      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(screen.getByText('errors.cannotDeleteSelf')).toBeInTheDocument();
      });
      expect(toastErrorMock).toHaveBeenCalledWith('errors.cannotDeleteSelf');
    });

    it('displays NOT_FOUND error and shows toast', async () => {
      deleteInternalUserMock.mockResolvedValueOnce({ ok: false, error: 'NOT_FOUND' });

      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(screen.getByText('errors.notFound')).toBeInTheDocument();
      });
      expect(toastErrorMock).toHaveBeenCalledWith('errors.notFound');
    });

    it('displays NO_PASSWORD error and shows toast', async () => {
      deleteInternalUserMock.mockResolvedValueOnce({ ok: false, error: 'NO_PASSWORD' });

      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(screen.getByText('errors.noPassword')).toBeInTheDocument();
      });
      expect(toastErrorMock).toHaveBeenCalledWith('errors.noPassword');
    });

    it('displays INVALID_PASSWORD error in both error box and field', async () => {
      deleteInternalUserMock.mockResolvedValueOnce({ ok: false, error: 'INVALID_PASSWORD' });

      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrong' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        // Should appear twice: in error box and as field error
        const errors = screen.getAllByText('errors.invalidPassword');
        expect(errors.length).toBeGreaterThanOrEqual(1);
      });
      expect(toastErrorMock).toHaveBeenCalledWith('errors.invalidPassword');
    });

    it('displays generic error for SERVER_ERROR', async () => {
      deleteInternalUserMock.mockResolvedValueOnce({ ok: false, error: 'SERVER_ERROR' });

      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(screen.getByText('errors.genericError')).toBeInTheDocument();
      });
      expect(toastErrorMock).toHaveBeenCalledWith('errors.genericError');
    });

    it('displays generic error when action throws', async () => {
      deleteInternalUserMock.mockRejectedValueOnce(new Error('Network error'));

      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(screen.getByText('errors.genericError')).toBeInTheDocument();
      });
      expect(toastErrorMock).toHaveBeenCalledWith('errors.genericError');
    });
  });

  describe('Success Flow', () => {
    it('shows success toast on successful deletion', async () => {
      deleteInternalUserMock.mockResolvedValueOnce({ ok: true });

      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(toastSuccessMock).toHaveBeenCalledWith('success.toast', {
          description: 'john@example.com',
        });
      });
    });

    it('calls onDeletedAction callback on success', async () => {
      deleteInternalUserMock.mockResolvedValueOnce({ ok: true });
      const onDeleted = jest.fn();

      render(<UserDeleteDialog {...defaultProps} onDeletedAction={onDeleted} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalled();
      });
    });

    it('closes dialog on success', async () => {
      deleteInternalUserMock.mockResolvedValueOnce({ ok: true });
      const onOpenChange = jest.fn();

      render(<UserDeleteDialog {...defaultProps} onOpenChangeAction={onOpenChange} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('calls onPendingChangeAction with true then false', async () => {
      deleteInternalUserMock.mockResolvedValueOnce({ ok: true });
      const onPendingChange = jest.fn();

      render(<UserDeleteDialog {...defaultProps} onPendingChangeAction={onPendingChange} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(onPendingChange).toHaveBeenCalledWith(true);
        expect(onPendingChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('Action Invocation', () => {
    it('passes correct userId and password to deleteInternalUser', async () => {
      deleteInternalUserMock.mockResolvedValueOnce({ ok: true });

      render(<UserDeleteDialog {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'myPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

      await waitFor(() => {
        expect(deleteInternalUserMock).toHaveBeenCalledWith({
          userId: 'user-123',
          adminPassword: 'myPassword123',
        });
      });
    });
  });
});
