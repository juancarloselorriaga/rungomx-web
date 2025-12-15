import { EntityListView } from '@/components/list-view/entity-list-view';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

type Item = { id: string; name: string; createdAt: string };

describe('EntityListView', () => {
  it('renders headers and cells', () => {
    render(
      <EntityListView<Item, 'name', 'name'>
        items={[{ id: '1', name: 'Ada', createdAt: '2025-01-01' }]}
        getRowIdAction={(item) => item.id}
        columns={[
          {
            key: 'name',
            header: 'Name',
            cell: (item) => item.name,
            sortKey: 'name',
            defaultSortDir: 'asc',
          },
        ]}
      />,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('renders empty state when there are no items', () => {
    render(
      <EntityListView<Item, 'name'>
        items={[]}
        getRowIdAction={(item) => item.id}
        columns={[
          {
            key: 'name',
            header: 'Name',
            cell: (item) => item.name,
          },
        ]}
        emptyContent={<div>No results</div>}
      />,
    );

    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('renders loading rows via renderSkeletonRowsAction', () => {
    render(
      <EntityListView<Item, 'name'>
        items={[]}
        getRowIdAction={(item) => item.id}
        columns={[
          {
            key: 'name',
            header: 'Name',
            cell: (item) => item.name,
          },
        ]}
        isLoading
        renderSkeletonRowsAction={() => (
          <tr>
            <td>Loading…</td>
          </tr>
        )}
      />,
    );

    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('calls onSortChangeAction when clicking a sortable header', () => {
    const onSortChangeAction = jest.fn();

    render(
      <EntityListView<Item, 'name' | 'created', 'name' | 'createdAt'>
        items={[{ id: '1', name: 'Ada', createdAt: '2025-01-01' }]}
        getRowIdAction={(item) => item.id}
        sort={{ key: 'name', dir: 'asc' }}
        onSortChangeAction={onSortChangeAction}
        columns={[
          {
            key: 'name',
            header: 'Name',
            cell: (item) => item.name,
            sortKey: 'name',
            defaultSortDir: 'asc',
          },
          {
            key: 'created',
            header: 'Created',
            cell: (item) => item.createdAt,
            sortKey: 'createdAt',
            defaultSortDir: 'desc',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /name/i }));
    expect(onSortChangeAction).toHaveBeenCalledWith({ key: 'name', dir: 'desc' });

    fireEvent.click(screen.getByRole('button', { name: /created/i }));
    expect(onSortChangeAction).toHaveBeenCalledWith({ key: 'createdAt', dir: 'desc' });
  });
});

