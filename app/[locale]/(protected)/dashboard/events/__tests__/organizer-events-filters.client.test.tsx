/**
 * Regression tests for the stale off-route navigation bug.
 *
 * When the user types in the organizer-events search box and then navigates
 * away before the debounce fires, the pending timeout must NOT call
 * router.replace against the new (unrelated) route.
 */
import { render, screen, act, fireEvent } from '@testing-library/react';
import { OrganizerEventsFilters } from '../organizer-events-filters';
import { normalizeOrganizerEventsQuery } from '@/lib/events/organizer-events';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
let mockPathname = '/en/tablero/eventos';

jest.mock('@/i18n/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const EVENTS_ROUTE = '/en/tablero/eventos';
const WIZARD_ROUTE = '/en/tablero/eventos/nuevo';
const SEARCH_THROTTLE_MS = 400;

const defaultQuery = normalizeOrganizerEventsQuery({});

function renderFilters(pathname = EVENTS_ROUTE) {
  mockPathname = pathname;
  return render(
    <OrganizerEventsFilters
      query={defaultQuery}
      organizations={[]}
      totalEvents={0}
      filteredEvents={0}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  mockReplace.mockClear();
  mockPathname = EVENTS_ROUTE;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('OrganizerEventsFilters — on-route search', () => {
  it('calls router.replace with search param after debounce when still on the events route', () => {
    renderFilters(EVENTS_ROUTE);

    const input = screen.getByRole('searchbox');
    act(() => {
      fireEvent.change(input, { target: { value: 'marathon' } });
    });

    expect(mockReplace).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(SEARCH_THROTTLE_MS + 50);
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const [href] = mockReplace.mock.calls[0];
    expect(href.query?.search).toBe('marathon');
  });
});

describe('OrganizerEventsFilters — stale off-route search', () => {
  it('does NOT call router.replace when pathname has changed before the debounce fires', () => {
    const { rerender } = renderFilters(EVENTS_ROUTE);

    const input = screen.getByRole('searchbox');
    act(() => {
      fireEvent.change(input, { target: { value: 'marathon' } });
    });

    // Simulate the user navigating away before the debounce fires
    mockPathname = WIZARD_ROUTE;
    rerender(
      <OrganizerEventsFilters
        query={defaultQuery}
        organizations={[]}
        totalEvents={0}
        filteredEvents={0}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(SEARCH_THROTTLE_MS + 50);
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('cancels pending debounce on unmount and does not navigate afterwards', () => {
    const { unmount } = renderFilters(EVENTS_ROUTE);

    const input = screen.getByRole('searchbox');
    act(() => {
      fireEvent.change(input, { target: { value: 'trail' } });
    });

    unmount();

    act(() => {
      jest.advanceTimersByTime(SEARCH_THROTTLE_MS + 50);
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
