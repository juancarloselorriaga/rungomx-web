import { UsersListTable, type UsersListRow } from '@/components/admin/users/users-list-table';
import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    dateTime: () => 'formatted-date',
  }),
}));

jest.mock('next-intl/routing', () => ({
  defineRouting: jest.fn(() => ({
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed',
    pathnames: {},
  })),
}));

const routerPushMock = jest.fn();
const routerReplaceMock = jest.fn();
const routerRefreshMock = jest.fn();

jest.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    ...props
  }: React.PropsWithChildren<React.AnchorHTMLAttributes<HTMLAnchorElement>>) => (
    <a {...props}>{children}</a>
  ),
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
    refresh: routerRefreshMock,
  }),
  usePathname: () => '/admin/users',
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
}));

describe('UsersListTable', () => {
  beforeEach(() => {
    routerPushMock.mockReset();
    routerReplaceMock.mockReset();
    routerRefreshMock.mockReset();
    window.localStorage.clear();
  });

  const baseProps = {
    query: {
      page: 1,
      pageSize: 10,
      role: 'all' as const,
      search: '',
      sortBy: 'createdAt' as const,
      sortDir: 'desc' as const,
    },
    paginationMeta: {
      page: 1,
      pageSize: 10,
      total: 0,
      pageCount: 0,
    },
    densityStorageKey: 'test.tableDensity',
    labels: {
      toolbar: {
        searchLabel: 'Search',
        filtersLabel: 'Filters',
        searchPlaceholder: 'Search by name or email',
        applyButton: 'Apply',
        clearFilters: 'Clear filters',
        displayLabel: 'Display',
        columnsButton: 'Columns',
        columnsLabel: 'Show columns',
      },
      density: {
        comfortable: 'Comfortable',
        compact: 'Compact',
      },
      table: {
        columns: {
          name: 'Name',
          role: 'Role',
          created: 'Created',
          actions: 'Actions',
        },
        noMatches: {
          title: 'No matches',
          description: 'Try adjusting your search.',
          clearButton: 'Clear filters',
        },
      },
    },
    roleOptions: [
      { key: 'all' as const, label: 'All' },
      { key: 'admin' as const, label: 'Admin' },
    ],
    paginationTranslationNamespace: 'pages.adminUsers.pagination' as const,
    renderActionsAction: () => <div>Row actions</div>,
  };

  it('renders empty state for 0 users and can clear filters', () => {
    render(<UsersListTable users={[]} {...baseProps} />);

    expect(screen.getByText('No matches')).toBeInTheDocument();
    const emptyStateCell = screen.getByText('No matches').closest('td');
    expect(emptyStateCell).not.toBeNull();
    fireEvent.click(within(emptyStateCell as HTMLElement).getByRole('button', { name: 'Clear filters' }));

    expect(routerPushMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/admin/users',
        query: expect.objectContaining({ page: '1' }),
      }),
      expect.anything(),
    );
  });

  it('renders rows and does not render a permissions column', () => {
    const users: UsersListRow[] = [
      {
        userId: 'u1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        canonicalRoles: ['internal.admin'],
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ];

    render(
      <UsersListTable
        {...baseProps}
        users={users}
        paginationMeta={{ ...baseProps.paginationMeta, total: 1, pageCount: 1 }}
        getRoleBadgeLabelAction={(role) => (role === 'internal.admin' ? 'Admin' : role)}
        renderActionsAction={() => <div>Row actions</div>}
      />,
    );

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    const row = screen.getByText('Ada Lovelace').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Admin')).toBeInTheDocument();
    expect(screen.getAllByText('Row actions')).toHaveLength(1);

    expect(screen.queryByText(/permissions/i)).not.toBeInTheDocument();
  });

  it('navigates on sort when clicking sortable headers', () => {
    const users: UsersListRow[] = [
      {
        userId: 'u1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        canonicalRoles: ['internal.admin'],
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ];

    render(
      <UsersListTable
        {...baseProps}
        users={users}
        paginationMeta={{ ...baseProps.paginationMeta, total: 1, pageCount: 1 }}
        renderActionsAction={() => <div>Row actions</div>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /name/i }));
    expect(routerPushMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/admin/users',
        query: expect.objectContaining({ sort: 'name', dir: 'asc', page: '1' }),
      }),
      expect.anything(),
    );
  });
});
