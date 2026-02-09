import { TableProResultsGrid } from '@/components/results/organizer/table-pro-results-grid';
import { fireEvent, render, screen, within } from '@testing-library/react';

describe('TableProResultsGrid', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const labels = {
    title: 'Draft table',
    description: 'Status semantics stay visible in all densities.',
    empty: 'No rows',
    headers: {
      bib: 'Bib',
      runner: 'Runner',
      validation: 'Validation',
      resultStatus: 'Result status',
      syncStatus: 'Sync status',
      finishTime: 'Finish time',
      updated: 'Updated',
      details: 'Details',
    },
    density: {
      label: 'Density',
      compact: 'Compact',
      full: 'Full',
    },
    resultStatus: {
      finish: 'Finish',
      dnf: 'DNF',
      dns: 'DNS',
      dq: 'DQ',
    },
    syncStatus: {
      synced: 'Synced',
      pendingSync: 'Pending sync',
      conflict: 'Conflict',
    },
    validationState: {
      clear: 'Clear',
      warning: 'Warning',
      blocker: 'Blocker',
    },
  } as const;

  it('keeps trust status semantics visible in compact and full modes', () => {
    render(
      <TableProResultsGrid
        densityStorageKey="results.grid.test"
        labels={labels}
        rows={[
          {
            id: 'row-1',
            bibNumber: '101',
            runnerName: 'Runner One',
            resultStatus: 'finish',
            syncStatus: 'pending_sync',
            finishTimeMillis: 120000,
            updatedAtLabel: '02/07/26, 09:00',
            details: 'Saved locally.',
          },
        ]}
      />,
    );

    const desktop = screen.getByTestId('pro-results-grid-table');
    const desktopScope = within(desktop);
    expect(desktopScope.getByText('Finish')).toBeInTheDocument();
    expect(desktopScope.getByText('Pending sync')).toBeInTheDocument();
    expect(desktopScope.getByRole('columnheader', { name: 'Details' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /compact/i }));

    expect(desktopScope.getByText('Finish')).toBeInTheDocument();
    expect(desktopScope.getByText('Pending sync')).toBeInTheDocument();
    expect(desktopScope.queryByRole('columnheader', { name: 'Details' })).not.toBeInTheDocument();
  });

  it('renders review validation state when provided', () => {
    render(
      <TableProResultsGrid
        densityStorageKey="results.grid.validation"
        labels={labels}
        rows={[
          {
            id: 'row-validation-1',
            bibNumber: '555',
            runnerName: 'Review Runner',
            validationState: 'blocker',
            resultStatus: 'finish',
            syncStatus: 'conflict',
            finishTimeMillis: null,
            updatedAtLabel: '02/07/26, 09:00',
            details: 'Conflict pending.',
          },
        ]}
      />,
    );

    const desktop = screen.getByTestId('pro-results-grid-table');
    const desktopScope = within(desktop);
    expect(desktopScope.getByRole('columnheader', { name: 'Validation' })).toBeInTheDocument();
    expect(desktopScope.getByText('Blocker')).toBeInTheDocument();
  });

  it('renders a mobile card/list layout alongside the desktop table wrapper', () => {
    render(
      <TableProResultsGrid
        densityStorageKey="results.grid.mobile"
        labels={labels}
        rows={[
          {
            id: 'row-mobile-1',
            bibNumber: '42',
            runnerName: 'Mobile Runner',
            validationState: 'warning',
            resultStatus: 'finish',
            syncStatus: 'synced',
            finishTimeMillis: 120000,
            updatedAtLabel: '02/07/26, 09:00',
            details: 'Looks good.',
          },
        ]}
      />,
    );

    const mobile = screen.getByTestId('pro-results-grid-mobile');
    expect(mobile).toHaveTextContent('Mobile Runner');
    expect(mobile.querySelector('table')).toBeNull();

    const desktop = screen.getByTestId('pro-results-grid-table');
    expect(desktop.querySelector('table')).toBeInTheDocument();
  });
});
