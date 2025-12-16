import { UsersTableActions } from '@/components/admin/users/users-table-actions';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? children : <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onSelect?: (event: { preventDefault: () => void }) => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={() => onSelect?.({ preventDefault: () => undefined })}
      disabled={disabled}
      className={className}
      data-testid="dropdown-item"
    >
      {children}
    </button>
  ),
}));

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
  useTranslations: () => (key: string) => key,
}));

describe('UsersTableActions', () => {
  const defaultProps = {
    userId: 'user-123',
    userName: 'John Doe',
    userEmail: 'john@example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dropdown menu with delete option', () => {
    render(<UsersTableActions {...defaultProps} />);

    expect(screen.getByText('deleteUser')).toBeInTheDocument();
  });

  it('disables delete option when user is current user (self)', () => {
    render(<UsersTableActions {...defaultProps} currentUserId="user-123" />);

    const deleteButton = screen.getByTestId('dropdown-item');
    expect(deleteButton).toBeDisabled();
  });

  it('enables delete option when user is not current user', () => {
    render(<UsersTableActions {...defaultProps} currentUserId="other-user" />);

    const deleteButton = screen.getByTestId('dropdown-item');
    expect(deleteButton).not.toBeDisabled();
  });

  it('opens delete dialog when delete clicked', () => {
    render(<UsersTableActions {...defaultProps} currentUserId="other-user" />);

    fireEvent.click(screen.getByText('deleteUser'));

    expect(screen.getByText('title')).toBeInTheDocument();
  });

  it('does not open delete dialog when self-deletion attempted', () => {
    render(<UsersTableActions {...defaultProps} currentUserId="user-123" />);

    fireEvent.click(screen.getByText('deleteUser'));

    expect(screen.queryByText('title')).not.toBeInTheDocument();
  });

  it('disables delete button when deletion is in progress', async () => {
    deleteInternalUserMock.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<UsersTableActions {...defaultProps} currentUserId="other-user" />);

    // Open dialog and submit
    fireEvent.click(screen.getByText('deleteUser'));
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

    // The delete dialog button shows aria-busy when loading
    await waitFor(() => {
      const busyButton = document.querySelector('button[aria-busy="true"]');
      expect(busyButton).toBeDisabled();
    });
  });

  it('calls onDeletedAction after successful deletion', async () => {
    deleteInternalUserMock.mockResolvedValueOnce({ ok: true });
    const onDeleted = jest.fn();

    render(<UsersTableActions {...defaultProps} currentUserId="other-user" onDeletedAction={onDeleted} />);

    // Open dialog and submit
    fireEvent.click(screen.getByText('deleteUser'));
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'buttons.delete' }));

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
    });
  });

  it('passes correct user props to delete dialog', () => {
    render(<UsersTableActions {...defaultProps} currentUserId="other-user" />);

    fireEvent.click(screen.getByText('deleteUser'));

    // Dialog should show user info
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });
});
