import { CorrectionAuditTrail } from '@/components/results/organizer/correction-audit-trail';
import { render, screen } from '@testing-library/react';

const labels = {
  title: 'Correction audit trail',
  description: 'Internal timeline',
  empty: 'No items',
  fields: {
    requestId: 'Request ID',
    reason: 'Reason',
    requestedBy: 'Requested by',
    reviewedBy: 'Reviewed by',
    requestedAt: 'Requested at',
    reviewedAt: 'Reviewed at',
    publishedAt: 'Published at',
    versionTransition: 'Version transition',
  },
  fallback: {
    pending: 'Pending',
    noPublishedAt: 'Not published',
  },
} as const;

describe('CorrectionAuditTrail', () => {
  it('renders timeline entries linked to source and corrected version ids', () => {
    render(
      <CorrectionAuditTrail
        items={[
          {
            requestId: 'request-1',
            sourceResultVersionId: 'version-7',
            correctedResultVersionId: 'version-8',
            status: 'approved',
            reason: 'Age group update',
            requestedByUserId: 'runner-1',
            reviewedByUserId: 'organizer-1',
            requestedAt: new Date('2026-02-07T07:00:00.000Z'),
            reviewedAt: new Date('2026-02-07T07:10:00.000Z'),
            publishedAt: new Date('2026-02-07T07:20:00.000Z'),
            requestedAtLabel: '2/7/26, 7:00 AM',
            reviewedAtLabel: '2/7/26, 7:10 AM',
            publishedAtLabel: '2/7/26, 7:20 AM',
          },
        ]}
        labels={labels}
      />,
    );

    expect(screen.getByText('Correction audit trail')).toBeInTheDocument();
    expect(screen.getByText('request-1')).toBeInTheDocument();
    expect(screen.getByText('version-7 -> version-8')).toBeInTheDocument();
    expect(screen.getByText('Age group update')).toBeInTheDocument();
  });

  it('renders empty state when no timeline entries are available', () => {
    render(<CorrectionAuditTrail items={[]} labels={labels} />);

    expect(screen.getByText('No items')).toBeInTheDocument();
  });
});
