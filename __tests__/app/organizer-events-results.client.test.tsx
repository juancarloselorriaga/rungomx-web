import { render, screen } from '@testing-library/react';

import { OrganizerEventsResults } from '@/app/[locale]/(protected)/dashboard/events/organizer-events-results';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const messages: Record<string, string> = {
      'emptyState.title': 'No events yet',
      'emptyState.description': 'Create your first event to start managing registrations.',
      'emptyState.action': 'Create event',
      'filters.title': 'Quick search',
      'filters.summary': values
        ? `Showing ${values.filtered} of ${values.total} events`
        : 'Showing',
      'filters.noResults.title': 'No matching events',
      'filters.noResults.description': 'Try adjusting your filters or clearing the search.',
      'filters.noResults.action': 'Clear filters',
      'visibility.draft': 'Draft',
      'visibility.published': 'Published',
      'visibility.unlisted': 'Unlisted',
      'visibility.archived': 'Archived',
      registrationCount: 'registrations',
      distance: 'distance',
      distances: 'distances',
    };

    return messages[key] ?? key;
  },
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: unknown }) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ asChild, children, ...props }: { asChild?: boolean; children: React.ReactNode }) =>
    asChild ? <>{children}</> : <button {...props}>{children}</button>,
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

jest.mock('@/components/ui/surface', () => ({
  Surface: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  InsetSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/app/[locale]/(protected)/dashboard/events/organizer-events-filters', () => ({
  OrganizerEventsFilters: () => <div data-testid="organizer-events-filters" />,
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: () => <div data-testid="next-image" />,
}));

describe('OrganizerEventsResults', () => {
  it('renders the empty state CTA when there are no events at all', () => {
    render(
      <OrganizerEventsResults
        query={{
          search: '',
          visibility: 'all',
          time: 'all',
          registration: 'all',
          organizationId: '',
          sort: 'priority',
        }}
        organizations={[]}
        totalEvents={0}
        filteredEvents={[]}
        locale="en"
      />,
    );

    expect(screen.getByText('No events yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create event' })).toHaveAttribute(
      'href',
      '/dashboard/events/new',
    );
    expect(screen.queryByTestId('organizer-events-filters')).not.toBeInTheDocument();
  });
});
