import { render, screen } from '@testing-library/react';

import { TrustScanHeader } from '@/components/results/primitives/trust-scan-header';

const LABELS = {
  title: 'Trust scan',
  description: 'Immediate legitimacy cues.',
  fallback: 'Not available',
  fields: {
    organizer: 'Organizer authority',
    scope: 'Scope',
    version: 'Version',
    updatedAt: 'Last update',
    correction: 'Correction indicator',
  },
  status: {
    official: 'Official',
    corrected: 'Corrected',
    unknown: 'Status unavailable',
  },
  correction: {
    corrected: 'Corrections applied',
    none: 'No correction publication',
  },
} as const;

describe('TrustScanHeader', () => {
  it('renders trust-critical fields and corrected indicator when status is corrected', () => {
    render(
      <TrustScanHeader
        status="corrected"
        organizerName="Ultra Valle Organization"
        scope="Official edition results ledger"
        version="Version 5"
        updatedAt="May 19, 2026 09:00"
        labels={LABELS}
      />,
    );

    expect(screen.getByText('Trust scan')).toBeInTheDocument();
    expect(screen.getByText('Corrected')).toBeInTheDocument();
    expect(screen.getByText('Ultra Valle Organization')).toBeInTheDocument();
    expect(screen.getByText('Official edition results ledger')).toBeInTheDocument();
    expect(screen.getByText('Version 5')).toBeInTheDocument();
    expect(screen.getByText('May 19, 2026 09:00')).toBeInTheDocument();
    expect(screen.getByText('Corrections applied')).toBeInTheDocument();
  });

  it('renders fallback copy when trust fields are unavailable', () => {
    render(
      <TrustScanHeader
        status={null}
        organizerName={null}
        scope={null}
        version={null}
        updatedAt={null}
        labels={LABELS}
      />,
    );

    expect(screen.getByText('Status unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('Not available')).toHaveLength(4);
    expect(screen.getByText('No correction publication')).toBeInTheDocument();
  });
});
