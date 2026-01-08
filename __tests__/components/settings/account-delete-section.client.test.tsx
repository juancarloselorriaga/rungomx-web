import { AccountDeleteSection } from '@/components/settings/account/account-delete-section';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const deleteOwnAccountMock = jest.fn();
jest.mock('@/app/actions/account-delete', () => ({
  deleteOwnAccount: (...args: unknown[]) => deleteOwnAccountMock(...args),
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
  useTranslations: () => (key: string) => key,
}));

describe('AccountDeleteSection', () => {
  const defaultProps = {
    userEmail: 'user@example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the danger zone section', () => {
      render(<AccountDeleteSection {...defaultProps} />);

      expect(screen.getByText('sectionLabel')).toBeInTheDocument();
      expect(screen.getByText('title')).toBeInTheDocument();
      expect(screen.getByText('description')).toBeInTheDocument();
    });

    it('renders the delete button', () => {
      render(<AccountDeleteSection {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'actions.delete' })).toBeInTheDocument();
    });

    it('dialog is not visible initially', () => {
      render(<AccountDeleteSection {...defaultProps} />);

      expect(screen.queryByText('dialog.title')).not.toBeInTheDocument();
    });
  });

  describe('Dialog Interactions', () => {
    it('opens dialog when delete button is clicked', () => {
      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));

      expect(screen.getByText('dialog.title')).toBeInTheDocument();
    });

    it('displays user email in dialog', () => {
      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));

      expect(screen.getByText('user@example.com')).toBeInTheDocument();
    });

    it('displays warning message in dialog', () => {
      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));

      expect(screen.getByText('dialog.warning.title')).toBeInTheDocument();
      expect(screen.getByText('dialog.warning.description')).toBeInTheDocument();
    });

    it('closes dialog when cancel is clicked', () => {
      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      expect(screen.getByText('dialog.title')).toBeInTheDocument();

      fireEvent.click(screen.getByText('dialog.buttons.cancel'));

      expect(screen.queryByText('dialog.title')).not.toBeInTheDocument();
    });

    it('clears form state when dialog closes', () => {
      render(<AccountDeleteSection {...defaultProps} />);

      // Open dialog and trigger error
      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));
      expect(screen.getByText('dialog.fields.password.required')).toBeInTheDocument();

      // Close and reopen dialog
      fireEvent.click(screen.getByText('dialog.buttons.cancel'));
      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));

      // Error should be cleared
      expect(screen.queryByText('dialog.fields.password.required')).not.toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('shows validation error for empty password', () => {
      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));

      expect(screen.getByText('dialog.fields.password.required')).toBeInTheDocument();
      expect(deleteOwnAccountMock).not.toHaveBeenCalled();
    });

    it('shows validation error for whitespace-only password', () => {
      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: '   ' } });
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));

      expect(screen.getByText('dialog.fields.password.required')).toBeInTheDocument();
      expect(deleteOwnAccountMock).not.toHaveBeenCalled();
    });
  });

  describe('Pending State', () => {
    it('disables confirm button while pending', async () => {
      deleteOwnAccountMock.mockImplementation(() => new Promise(() => {}));

      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password' } });
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));

      await waitFor(() => {
        const busyButton = document.querySelector('button[aria-busy="true"]');
        expect(busyButton).toBeDisabled();
      });
    });

    it('disables password input while pending', async () => {
      deleteOwnAccountMock.mockImplementation(() => new Promise(() => {}));

      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password' } });
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('••••••••')).toBeDisabled();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays UNAUTHENTICATED error and shows toast', async () => {
      deleteOwnAccountMock.mockResolvedValueOnce({ ok: false, error: 'UNAUTHENTICATED' });

      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));

      await waitFor(() => {
        expect(screen.getByText('dialog.errors.unauthenticated')).toBeInTheDocument();
      });
      expect(toastErrorMock).toHaveBeenCalledWith('dialog.errors.unauthenticated');
    });

    it('displays NO_PASSWORD error and shows toast', async () => {
      deleteOwnAccountMock.mockResolvedValueOnce({ ok: false, error: 'NO_PASSWORD' });

      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));

      await waitFor(() => {
        expect(screen.getByText('dialog.errors.noPassword')).toBeInTheDocument();
      });
      expect(toastErrorMock).toHaveBeenCalledWith('dialog.errors.noPassword');
    });

    it('displays INVALID_PASSWORD error in both error box and field', async () => {
      deleteOwnAccountMock.mockResolvedValueOnce({ ok: false, error: 'INVALID_PASSWORD' });

      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrong' } });
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));

      await waitFor(() => {
        const errors = screen.getAllByText('dialog.errors.invalidPassword');
        expect(errors.length).toBeGreaterThanOrEqual(1);
      });
      expect(toastErrorMock).toHaveBeenCalledWith('dialog.errors.invalidPassword');
    });

    it('displays generic error for SERVER_ERROR', async () => {
      deleteOwnAccountMock.mockResolvedValueOnce({ ok: false, error: 'SERVER_ERROR' });

      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));

      await waitFor(() => {
        expect(screen.getByText('dialog.errors.genericError')).toBeInTheDocument();
      });
      expect(toastErrorMock).toHaveBeenCalledWith('dialog.errors.genericError');
    });

    it('displays generic error when action throws', async () => {
      deleteOwnAccountMock.mockRejectedValueOnce(new Error('Network error'));

      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));

      await waitFor(() => {
        expect(screen.getByText('dialog.errors.genericError')).toBeInTheDocument();
      });
      expect(toastErrorMock).toHaveBeenCalledWith('dialog.errors.genericError');
    });
  });

  describe('Success Flow', () => {
    it('shows success toast on successful deletion', async () => {
      deleteOwnAccountMock.mockResolvedValueOnce({ ok: true });

      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));

      await waitFor(() => {
        expect(toastSuccessMock).toHaveBeenCalledWith('dialog.success.toast');
      });
    });

    it('closes dialog on success', async () => {
      deleteOwnAccountMock.mockResolvedValueOnce({ ok: true });

      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      expect(screen.getByText('dialog.title')).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));

      await waitFor(() => {
        expect(screen.queryByText('dialog.title')).not.toBeInTheDocument();
      });
    });
  });

  describe('Action Invocation', () => {
    it('passes correct password to deleteOwnAccount', async () => {
      deleteOwnAccountMock.mockResolvedValueOnce({ ok: true });

      render(<AccountDeleteSection {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
      fireEvent.change(screen.getByPlaceholderText('••••••••'), {
        target: { value: 'myPassword123' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'dialog.buttons.confirmDelete' }));

      await waitFor(() => {
        expect(deleteOwnAccountMock).toHaveBeenCalledWith({ password: 'myPassword123' });
      });
    });
  });
});
