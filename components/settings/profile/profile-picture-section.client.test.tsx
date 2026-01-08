import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

// Mock i18n/navigation before importing components that use it
jest.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/settings/profile',
}));

import { ProfilePictureSection } from './profile-picture-section';

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      title: 'Profile picture',
      description: 'Upload a photo to personalize your profile.',
      hint: `JPEG, PNG, WebP, or GIF. Max ${values?.maxSize ?? 5}MB.`,
      preview: 'Preview',
      uploading: 'Uploading...',
      deleting: 'Deleting...',
      'actions.upload': 'Upload photo',
      'actions.change': 'Change photo',
      'actions.delete': 'Delete',
      'success.uploaded': 'Profile picture updated.',
      'success.deleted': 'Profile picture removed.',
      'errors.invalidImage': 'Invalid image. Please try another file.',
      'errors.uploadFailed': 'Upload failed. Please try again.',
      'errors.deleteFailed': 'Could not delete the picture. Please try again.',
      'deleteDialog.title': 'Delete profile picture?',
      'deleteDialog.description': 'This will remove your profile picture.',
      'deleteDialog.cancel': 'Cancel',
      'deleteDialog.confirm': 'Delete',
    };
    return translations[key] ?? key;
  },
}));

// Mock server actions
jest.mock('@/app/actions/profile-picture', () => ({
  confirmProfilePictureUpload: jest.fn(),
  deleteExistingPictureAction: jest.fn(),
  deleteProfilePictureAction: jest.fn(),
}));

// Mock sonner
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock Vercel Blob upload
jest.mock('@vercel/blob/client', () => ({
  upload: jest.fn(),
}));

// Minimal mock user - cast to User type for tests
const mockUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Parameters<typeof ProfilePictureSection>[0]['user'];

describe('ProfilePictureSection', () => {
  it('renders upload button when no image exists', () => {
    render(<ProfilePictureSection user={mockUser} isInternal={false} />);

    expect(screen.getByRole('button', { name: /upload photo/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('renders change and delete buttons when image exists', () => {
    const userWithImage = {
      ...mockUser,
      image: 'https://example.com/pic.jpg',
    } as Parameters<typeof ProfilePictureSection>[0]['user'];
    render(<ProfilePictureSection user={userWithImage} isInternal={false} />);

    expect(screen.getByRole('button', { name: /change photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('does not render for internal users', () => {
    const { container } = render(<ProfilePictureSection user={mockUser} isInternal={true} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders section title and description', () => {
    render(<ProfilePictureSection user={mockUser} isInternal={false} />);

    expect(screen.getByText('Profile picture')).toBeInTheDocument();
    expect(screen.getByText('Upload a photo to personalize your profile.')).toBeInTheDocument();
  });

  it('renders hint text with max file size', () => {
    render(<ProfilePictureSection user={mockUser} isInternal={false} />);

    expect(screen.getByText(/max 5mb/i)).toBeInTheDocument();
  });

  it('disables buttons when isBusy is true', () => {
    render(<ProfilePictureSection user={mockUser} isInternal={false} isBusy={true} />);

    const uploadButton = screen.getByRole('button', { name: /upload photo/i });
    expect(uploadButton).toBeDisabled();
  });

  it('renders hidden file input with correct accept attribute', () => {
    render(<ProfilePictureSection user={mockUser} isInternal={false} />);

    const fileInput = screen.getByTestId('file-input');
    expect(fileInput).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif');
    expect(fileInput).toHaveAttribute('type', 'file');
  });
});
