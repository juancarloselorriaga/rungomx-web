import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';

import { useLocaleSyncOnAuth } from '@/hooks/use-locale-sync-on-auth';

const mockReplace = jest.fn();
const mockUseSession = jest.fn();
const mockUseLocale = jest.fn();
const mockUsePathname = jest.fn();
const mockUseParams = jest.fn();
const mockUseSearchParams = jest.fn();

jest.mock('@/lib/auth/client', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('next-intl', () => ({
  useLocale: () => mockUseLocale(),
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  usePathname: () => mockUsePathname(),
}));

jest.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
  useSearchParams: () => mockUseSearchParams(),
}));

function HookProbe({ initialPreferredLocale }: { initialPreferredLocale?: string | null }) {
  const { preferredLocale, isLocaleRedirectPending } = useLocaleSyncOnAuth(initialPreferredLocale);

  return (
    <div>
      <span data-testid="preferred-locale">{preferredLocale ?? 'null'}</span>
      <span data-testid="pending-state">{String(isLocaleRedirectPending)}</span>
    </div>
  );
}

describe('useLocaleSyncOnAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseSession.mockReturnValue({
      data: {
        user: { id: 'user-1' },
        profile: { locale: 'es' },
      },
      isPending: false,
    });
    mockUseLocale.mockReturnValue('en');
    mockUsePathname.mockReturnValue('/dashboard/events/[eventId]/settings');
    mockUseParams.mockReturnValue({ eventId: 'evt-1' });
    mockUseSearchParams.mockReturnValue(new URLSearchParams('wizard=1&step=basics&assistant=1'));
  });

  it('replaces once with the same pathname, params, and query when locale normalization is needed', async () => {
    render(<HookProbe initialPreferredLocale="es" />);

    expect(screen.getByTestId('preferred-locale')).toHaveTextContent('es');
    expect(screen.getByTestId('pending-state')).toHaveTextContent('true');

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledTimes(1);
    });

    expect(mockReplace).toHaveBeenCalledWith(
      {
        pathname: '/dashboard/events/[eventId]/settings',
        params: { eventId: 'evt-1' },
        query: {
          wizard: '1',
          step: 'basics',
          assistant: '1',
        },
      },
      { locale: 'es' },
    );
  });

  it('does not replace and reports a settled state when the current locale already matches', async () => {
    mockUseLocale.mockReturnValue('es');

    render(<HookProbe initialPreferredLocale="es" />);

    expect(screen.getByTestId('preferred-locale')).toHaveTextContent('es');
    expect(screen.getByTestId('pending-state')).toHaveTextContent('false');

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
