import { TableProResultsGrid } from '@/components/results/organizer/table-pro-results-grid';
import { fireEvent, render, screen } from '@testing-library/react';

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

    expect(screen.getByText('Finish')).toBeInTheDocument();
    expect(screen.getByText('Pending sync')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Details' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /compact/i }));

    expect(screen.getByText('Finish')).toBeInTheDocument();
    expect(screen.getByText('Pending sync')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Details' })).not.toBeInTheDocument();
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

    expect(screen.getByRole('columnheader', { name: 'Validation' })).toBeInTheDocument();
    expect(screen.getByText('Blocker')).toBeInTheDocument();
  });
});
