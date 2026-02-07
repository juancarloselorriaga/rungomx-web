import { ResultsVersionVisibilityPanel } from '@/components/results/organizer/results-version-visibility-panel';
import { render, screen } from '@testing-library/react';

const labels = {
  title: 'Official version visibility',
  description: 'Visibility panel description',
  empty: 'No versions',
  noOfficialVersion: 'No Official version yet',
  activeOfficialLabel: 'Active Official version available',
  activeMarker: 'Active official',
  historicalMarker: 'Historical',
  headers: {
    version: 'Version',
    status: 'Status',
    finalizedAt: 'Finalized at',
    finalizedBy: 'Finalized by',
    marker: 'Marker',
  },
  status: {
    draft: 'Draft',
    official: 'Official',
    corrected: 'Corrected',
  },
  unknownFinalizedAt: 'Not finalized',
  unknownFinalizedBy: 'Unknown',
} as const;

describe('ResultsVersionVisibilityPanel', () => {
  it('renders active official and historical markers with status labels', () => {
    render(
      <ResultsVersionVisibilityPanel
        visibility={{
          activeOfficialVersionId: 'version-2',
          items: [
            {
              id: 'version-3',
              versionNumber: 3,
              status: 'draft',
              isActiveOfficial: false,
              finalizedAt: null,
              finalizedByUserId: null,
              createdAt: new Date('2026-02-09T09:00:00.000Z'),
              finalizedAtLabel: '',
            },
            {
              id: 'version-2',
              versionNumber: 2,
              status: 'official',
              isActiveOfficial: true,
              finalizedAt: new Date('2026-02-08T09:00:00.000Z'),
              finalizedByUserId: 'organizer-1',
              createdAt: new Date('2026-02-08T08:00:00.000Z'),
              finalizedAtLabel: '2/8/26, 9:00 AM',
            },
          ],
        }}
        labels={labels}
      />,
    );

    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('Official')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Active official')).toBeInTheDocument();
    expect(screen.getByText('Historical')).toBeInTheDocument();
  });

  it('shows no-official badge when active official marker is unavailable', () => {
    render(
      <ResultsVersionVisibilityPanel
        visibility={{
          activeOfficialVersionId: null,
          items: [
            {
              id: 'version-1',
              versionNumber: 1,
              status: 'draft',
              isActiveOfficial: false,
              finalizedAt: null,
              finalizedByUserId: null,
              createdAt: new Date('2026-02-07T09:00:00.000Z'),
              finalizedAtLabel: '',
            },
          ],
        }}
        labels={labels}
      />,
    );

    expect(screen.getByText('No Official version yet')).toBeInTheDocument();
  });
});
