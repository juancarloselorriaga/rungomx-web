import { SampledReferenceList } from '@/components/admin/payments/sampled-reference-list';
import { render, screen } from '@testing-library/react';

describe('SampledReferenceList', () => {
  it('shows an explicit scoped count and stacked disclosure for sampled references', () => {
    render(
      <SampledReferenceList
        title="Trace references"
        items={['trace-alpha-123456789', 'trace-beta-123456789', 'trace-gamma-123456789']}
        totalCount={5}
        scopeLabel={(shown, total) => `Showing ${shown} of ${total} traces`}
        moreLabel={(count) => `Show ${count} more`}
        initialVisibleCount={2}
      />,
    );

    expect(screen.getByText('Trace references')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 5 traces')).toBeInTheDocument();
    expect(screen.getByText('trace-alpha-123456789')).toBeInTheDocument();
    expect(screen.getByText('Show 1 more')).toBeInTheDocument();
  });
});
