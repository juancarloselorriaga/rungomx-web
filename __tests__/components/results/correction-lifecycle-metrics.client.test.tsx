import { CorrectionLifecycleMetricsPanel } from '@/components/results/organizer/correction-lifecycle-metrics';
import { render, screen } from '@testing-library/react';

const labels = {
  title: 'Correction lifecycle metrics',
  description: 'SLA tracking',
  generatedAtLabel: 'Generated at',
  filtersTitle: 'Applied filters',
  summary: {
    total: 'Total requests',
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    medianResolutionHours: 'Median resolution (hours)',
    oldestPendingHours: 'Oldest pending (hours)',
  },
  aging: {
    title: 'Pending aging buckets',
    description: 'Aging distribution',
    lessThan24Hours: '< 24h',
    oneToThreeDays: '1-3 days',
    threeToSevenDays: '3-7 days',
    moreThanSevenDays: '> 7 days',
    highlightsTitle: 'Oldest pending requests',
    highlightsEmpty: 'No pending requests to highlight.',
    requestedAt: 'Requested at',
    requestedBy: 'Requested by',
    edition: 'Edition',
    ageHours: 'Age (hours)',
  },
  export: {
    action: 'Download metrics CSV',
    helper: 'Rows exported',
    empty: 'No rows available for export.',
    filePrefix: 'correction-lifecycle-metrics',
  },
  fallback: {
    notAvailable: 'N/A',
    notSet: 'Not set',
  },
  filters: {
    editionId: 'Edition',
    organizationId: 'Organization',
    requestedFrom: 'Requested from',
    requestedTo: 'Requested to',
  },
} as const;

describe('CorrectionLifecycleMetricsPanel', () => {
  it('renders summary metrics, aging highlights, and export action', () => {
    render(
      <CorrectionLifecycleMetricsPanel
        locale="en-US"
        metrics={{
          generatedAt: new Date('2026-02-08T12:00:00.000Z'),
          filters: {
            editionId: 'edition-1',
            organizationId: 'org-1',
            requestedFrom: new Date('2026-02-01T00:00:00.000Z'),
            requestedTo: new Date('2026-02-10T23:59:59.999Z'),
          },
          statusCounts: {
            total: 3,
            pending: 1,
            approved: 1,
            rejected: 1,
          },
          medianResolutionMillis: 5400000,
          medianResolutionHours: 1.5,
          pendingAging: {
            totalPending: 1,
            oldestPendingAgeHours: 72,
            buckets: {
              lessThan24Hours: 0,
              oneToThreeDays: 0,
              threeToSevenDays: 1,
              moreThanSevenDays: 0,
            },
          },
          agingHighlights: [
            {
              requestId: 'request-pending-old',
              editionId: 'edition-1',
              editionLabel: '2026',
              organizationId: 'org-1',
              requestedByUserId: 'runner-1',
              requestedAt: new Date('2026-02-05T12:00:00.000Z'),
              pendingAgeHours: 72,
            },
          ],
          exportRows: [
            {
              requestId: 'request-pending-old',
              status: 'pending',
              reason: 'Pending review',
              editionId: 'edition-1',
              editionLabel: '2026',
              organizationId: 'org-1',
              requestedByUserId: 'runner-1',
              reviewedByUserId: null,
              requestedAt: new Date('2026-02-05T12:00:00.000Z'),
              reviewedAt: null,
              resolutionMillis: null,
              pendingAgeHours: 72,
            },
          ],
        }}
        labels={labels}
      />,
    );

    expect(screen.getByText('Correction lifecycle metrics')).toBeInTheDocument();
    expect(screen.getByText('Total requests')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Oldest pending requests')).toBeInTheDocument();
    expect(screen.getByText('runner-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download metrics CSV' })).toBeInTheDocument();
  });

  it('renders export empty state when there are no rows', () => {
    render(
      <CorrectionLifecycleMetricsPanel
        locale="en-US"
        metrics={{
          generatedAt: new Date('2026-02-08T12:00:00.000Z'),
          filters: {
            editionId: null,
            organizationId: null,
            requestedFrom: null,
            requestedTo: null,
          },
          statusCounts: {
            total: 0,
            pending: 0,
            approved: 0,
            rejected: 0,
          },
          medianResolutionMillis: null,
          medianResolutionHours: null,
          pendingAging: {
            totalPending: 0,
            oldestPendingAgeHours: null,
            buckets: {
              lessThan24Hours: 0,
              oneToThreeDays: 0,
              threeToSevenDays: 0,
              moreThanSevenDays: 0,
            },
          },
          agingHighlights: [],
          exportRows: [],
        }}
        labels={labels}
      />,
    );

    expect(screen.getByText('No rows available for export.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download metrics CSV' })).not.toBeInTheDocument();
  });
});
