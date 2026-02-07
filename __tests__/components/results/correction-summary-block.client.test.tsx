import { CorrectionSummaryBlock } from '@/components/results/public/correction-summary-block';
import { render, screen } from '@testing-library/react';

const labels = {
  title: 'Recent correction summaries',
  description: 'Public correction transparency',
  empty: 'No corrections',
  fields: {
    reason: 'Reason',
    changes: 'What changed',
    approvedBy: 'Approved by',
    approvedAt: 'Approved at',
    versionTransition: 'Version transition',
  },
  fallback: {
    unknownApprover: 'Organizer',
    unknownTime: 'Unknown',
    noChanges: 'No detailed changes',
  },
} as const;

describe('CorrectionSummaryBlock', () => {
  it('renders concise correction attribution and change details', () => {
    render(
      <CorrectionSummaryBlock
        summaries={[
          {
            requestId: 'request-1',
            sourceResultVersionId: 'version-4',
            correctedResultVersionId: 'version-5',
            editionId: 'edition-1',
            editionLabel: '2026',
            editionSlug: 'ultra-valle-2026',
            seriesSlug: 'ultra-valle',
            reason: 'Finish time correction',
            changeSummary: [{ field: 'Finish time (ms)', value: '3590000' }],
            approvedAt: new Date('2026-02-07T08:00:00.000Z'),
            approvedAtLabel: '2/7/26, 8:00 AM',
            approvedByUserId: 'organizer-1',
            approvedByDisplayName: 'Jorge Organizer',
          },
        ]}
        labels={labels}
      />,
    );

    expect(screen.getByText('Recent correction summaries')).toBeInTheDocument();
    expect(screen.getByText('Finish time correction')).toBeInTheDocument();
    expect(screen.getByText('Jorge Organizer')).toBeInTheDocument();
    expect(screen.getByText('version-4 -> version-5')).toBeInTheDocument();
    expect(screen.getByText('Finish time (ms): 3590000')).toBeInTheDocument();
  });

  it('renders empty state when no correction summaries are available', () => {
    render(<CorrectionSummaryBlock summaries={[]} labels={labels} />);

    expect(screen.getByText('No corrections')).toBeInTheDocument();
  });
});
