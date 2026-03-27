import { fireEvent, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { EventsDirectory } from '@/app/[locale]/(public)/events/events-directory';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUseSession = jest.fn(() => ({ data: null }));
const mockSearchParams = new URLSearchParams('');

jest.mock('@/components/common/public-form-styles', () => ({
  publicFieldClassName: 'public-field',
  publicPanelClassName: 'public-panel',
  publicSelectClassName: 'public-select',
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/calendar', () => ({
  Calendar: () => <div data-testid="calendar" />,
}));

jest.mock('@/components/ui/icon-tooltip-button', () => ({
  IconTooltipButton: ({
    label,
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) => (
    <button type="button" aria-label={label} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

jest.mock('@/components/ui/slider', () => ({
  Slider: () => <div data-testid="slider" />,
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: { checked?: boolean; onCheckedChange?: (value: boolean) => void } & Record<
    string,
    unknown
  >) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked ?? false}
      onClick={() => onCheckedChange?.(!(checked ?? false))}
      {...props}
    />
  ),
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: { children: ReactNode; href: unknown }) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('@/lib/auth/client', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const messages: Record<string, string> = {
      title: 'Events',
      'search.placeholder': 'Search events',
      'filters.allSports': 'All sports',
      'filters.allStates': 'All states',
      'filters.advanced': 'More filters',
      'filters.dateRange': 'Date range',
      'filters.anyDate': 'Any date',
      'filters.upcoming': 'Upcoming',
      'filters.thisMonth': 'This month',
      'filters.nextMonth': 'Next month',
      'filters.next3Months': 'Next 3 months',
      'filters.customRange': 'Custom range',
      'filters.openOnly': 'Open registration',
      'filters.openOnlyEnabled': 'Open only enabled',
      'filters.openOnlyDisabled': 'Open only disabled',
      'filters.eventFormat': 'Event format',
      'filters.allFormats': 'All formats',
      'filters.inPerson': 'In person',
      'filters.virtual': 'Virtual',
      'filters.distanceRange': 'Distance range',
      'filters.nearLocation': 'Near location',
      'search.clearFilters': 'Clear filters',
      'pagination.showing': values ? `Showing ${values.total}` : 'Showing',
      'emptyState.title': 'No events yet',
      'emptyState.description': 'Try again later',
      'share.copyLink': 'Copy link',
      'share.copied': 'Copied',
      'share.copyFailed': 'Copy failed',
    };

    return messages[key] ?? key;
  },
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock(
  'next/dynamic',
  () => () =>
    function MockDynamicComponent() {
      return <div data-testid="location-field" />;
    },
);

jest.mock('next/image', () => ({
  __esModule: true,
  default: () => <div data-testid="next-image" />,
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('EventsDirectory advanced filters', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockReplace.mockReset();
    mockUseSession.mockReturnValue({ data: null });
  });

  it('keeps advanced filters closed until the trigger is clicked', () => {
    render(
      <EventsDirectory
        initialEvents={[]}
        initialPagination={{ page: 1, limit: 12, total: 0, totalPages: 0, hasMore: false }}
        initialNearbyEligible={false}
        locale="en"
      />,
    );

    const trigger = screen.getByRole('button', { name: /more filters/i });
    const panel = screen.getByRole('region', { hidden: true });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'events-advanced-filters-panel');
    expect(panel).toHaveAttribute('aria-label', 'More filters');
    expect(panel).toHaveAttribute('data-state', 'closed');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveAttribute('inert');
    expect(screen.queryByText('Date range')).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveAttribute('data-state', 'open');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(panel).not.toHaveAttribute('inert');
    expect(screen.getByText('Date range')).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('data-state', 'closed');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveAttribute('inert');
  });
});
