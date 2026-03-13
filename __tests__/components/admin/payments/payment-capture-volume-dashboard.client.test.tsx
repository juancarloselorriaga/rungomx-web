import { PaymentCaptureVolumeDashboard } from '@/components/admin/payments/payment-capture-volume-dashboard';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import type { PaymentCaptureVolumeMetrics } from '@/lib/payments/volume/payment-capture-volume';
import { render, screen } from '@testing-library/react';

type PaymentCaptureVolumeDashboardLabels =
  Parameters<typeof PaymentCaptureVolumeDashboard>[0]['labels'];

const labels: PaymentCaptureVolumeDashboardLabels = {
  sectionTitle: 'Captured payment volume',
  sectionDescription: 'Headline payment throughput from canonical captures.',
  mixedCurrencyNotice: (currency) =>
    `Headline money cards use the dominant source currency (${currency}) for this window.`,
  grossProcessedLabel: 'Gross processed',
  grossProcessedDescription: 'Before platform fees are separated.',
  platformFeesLabel: 'Platform fees captured',
  platformFeesDescription: 'Captured fee component.',
  organizerProceedsLabel: 'Organizer proceeds at capture',
  organizerProceedsDescription: 'Organizer-side amount at capture time.',
  capturedPaymentsLabel: 'Captured payments',
  capturedPaymentsDescription: 'Accepted canonical captures in this window.',
  currenciesTitle: 'Volume by source currency',
  currenciesDescription: 'Grouped by payment currency.',
  currencyHeader: 'Currency',
  grossHeader: 'Gross processed',
  feesHeader: 'Platform fees',
  proceedsHeader: 'Organizer proceeds',
  countHeader: 'Captures',
  emptyCurrencies: 'No captured payment volume was found for the selected window.',
  traceabilityTitle: 'Window traceability',
  traceabilityDescription: 'Reference period and sampled traces.',
  traceabilityWindowLabel: 'Period',
  traceabilityEventsLabel: 'Events considered',
  traceabilityTracesLabel: 'Traces considered',
  traceabilityExcludedLabel: 'Excluded captures',
  traceabilityFirstEventLabel: 'First event',
  traceabilityLastEventLabel: 'Last event',
  sampleTracesTitle: 'Sample trace references',
  sampleTracesEmpty: 'No trace references were found in the selected window.',
  sampleTracesScopeLabel: (shown, total) =>
    `Showing ${shown} sampled ${shown === 1 ? 'trace' : 'traces'} out of ${total}.`,
  sampleTracesMoreLabel: (count) => `Show ${count} more`,
  topOrganizersTitle: 'Top organizers in this window',
  topOrganizersDescription:
    'A limited organizer slice ranked for review without loading the full organizer population.',
  organizerHeader: 'Organizer',
  organizerGrossHeader: 'Gross processed',
  organizerFeesHeader: 'Platform fees',
  organizerProceedsHeader: 'Organizer proceeds',
  organizerCountHeader: 'Captures',
  organizerActionHeader: 'Investigation',
  organizerEmpty: 'No organizer ranking was found for the selected window.',
  organizerPageSummary: ({ start, end, total }) =>
    `Showing ${start}-${end} of ${total} ${total === 1 ? 'organizer' : 'organizers'}`,
  organizerPageStatus: ({ page, pageCount }) => `Page ${page} of ${pageCount}`,
  firstPageLabel: 'First',
  previousPageLabel: 'Previous',
  nextPageLabel: 'Next',
  lastPageLabel: 'Last',
  investigationTitle: 'Need trace-level evidence?',
  investigationDescription:
    'Use the investigation workspace for technical lookup and evidence review instead of opening raw traces in the volume ranking.',
  investigationActionLabel: 'Open investigation workspace',
  organizerActionLabel: 'Open in investigation',
};

const metrics: PaymentCaptureVolumeMetrics = {
  asOf: new Date('2026-03-10T14:09:00.000Z'),
  windowStart: new Date('2026-03-09T00:00:00.000Z'),
  windowEnd: new Date('2026-03-10T14:09:00.000Z'),
  headlineCurrency: 'MXN',
  headlineGrossProcessedMinor: 198_450,
  headlinePlatformFeeMinor: 9_450,
  headlineOrganizerProceedsMinor: 189_000,
  headlineCaptureCount: 3,
  currencies: [
    {
      sourceCurrency: 'MXN',
      grossProcessedMinor: 198_450,
      platformFeeMinor: 9_450,
      organizerProceedsMinor: 189_000,
      captureCount: 3,
    },
    {
      sourceCurrency: 'USD',
      grossProcessedMinor: 25_000,
      platformFeeMinor: 1_000,
      organizerProceedsMinor: 24_000,
      captureCount: 1,
    },
  ],
  organizers: [
    {
      organizerId: 'org-1',
      organizerLabel: 'Organizer One',
      headlineCurrency: 'MXN',
      headlineGrossProcessedMinor: 120_000,
      headlinePlatformFeeMinor: 6_000,
      headlineOrganizerProceedsMinor: 114_000,
      captureCount: 2,
      currencies: [
        {
          sourceCurrency: 'MXN',
          grossProcessedMinor: 120_000,
          platformFeeMinor: 6_000,
          organizerProceedsMinor: 114_000,
          captureCount: 2,
        },
      ],
      traceability: {
        distinctTraceCount: 2,
        firstOccurredAt: new Date('2026-03-09T23:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-10T10:00:00.000Z'),
        sampleTraceIds: ['org-1-trace'],
      },
    },
    {
      organizerId: 'org-2',
      organizerLabel: 'Organizer Two',
      headlineCurrency: 'USD',
      headlineGrossProcessedMinor: 25_000,
      headlinePlatformFeeMinor: 1_000,
      headlineOrganizerProceedsMinor: 24_000,
      captureCount: 1,
      currencies: [
        {
          sourceCurrency: 'USD',
          grossProcessedMinor: 25_000,
          platformFeeMinor: 1_000,
          organizerProceedsMinor: 24_000,
          captureCount: 1,
        },
      ],
      traceability: {
        distinctTraceCount: 1,
        firstOccurredAt: new Date('2026-03-10T12:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-10T12:00:00.000Z'),
        sampleTraceIds: ['org-2-trace'],
      },
    },
  ],
  organizerPagination: {
    page: 2,
    pageSize: 2,
    total: 5,
    pageCount: 3,
  },
  excludedEvents: [
    {
      traceId: 'trace-bad-1',
      organizerId: 'org-1',
      occurredAt: new Date('2026-03-10T09:00:00.000Z'),
      reason: 'math_mismatch',
    },
  ],
  traceability: {
    windowStart: new Date('2026-03-09T00:00:00.000Z'),
    windowEnd: new Date('2026-03-10T14:09:00.000Z'),
    eventCount: 4,
    distinctTraceCount: 4,
    firstOccurredAt: new Date('2026-03-09T22:35:00.000Z'),
    lastOccurredAt: new Date('2026-03-10T13:34:00.000Z'),
    sampleTraceIds: ['trace-1', 'trace-2', 'trace-bad-1'],
    excludedEventCount: 1,
  },
};

describe('payment capture volume dashboard', () => {
  it('renders headline cards, mixed-currency guidance, breakdown rows, organizer ranking, and traceability', () => {
    render(
      <PaymentCaptureVolumeDashboard
        locale="en"
        metrics={metrics}
        labels={labels}
        queryState={{ workspace: 'volume', range: '30d', organizerPage: '2' }}
      />,
    );

    expect(screen.getByText(labels.sectionTitle)).toBeInTheDocument();
    expect(screen.getByText(labels.sectionDescription)).toBeInTheDocument();
    expect(
      screen.getByText('Headline money cards use the dominant source currency (MXN) for this window.'),
    ).toBeInTheDocument();

    expect(screen.getAllByText(labels.grossProcessedLabel)).not.toHaveLength(0);
    expect(
      screen.getAllByText(
        formatMoneyFromMinor(metrics.headlineGrossProcessedMinor, metrics.headlineCurrency, 'en'),
      ),
    ).not.toHaveLength(0);
    expect(screen.getByText(labels.platformFeesLabel)).toBeInTheDocument();
    expect(
      screen.getAllByText(
        formatMoneyFromMinor(metrics.headlinePlatformFeeMinor, metrics.headlineCurrency, 'en'),
      ),
    ).not.toHaveLength(0);
    expect(screen.getByText(labels.organizerProceedsLabel)).toBeInTheDocument();
    expect(
      screen.getAllByText(
        formatMoneyFromMinor(
          metrics.headlineOrganizerProceedsMinor,
          metrics.headlineCurrency,
          'en',
        ),
      ),
    ).not.toHaveLength(0);
    expect(screen.getByText(labels.capturedPaymentsLabel)).toBeInTheDocument();
    expect(screen.getAllByText('3')).not.toHaveLength(0);

    expect(screen.getByText(labels.currenciesTitle)).toBeInTheDocument();
    expect(screen.getAllByText('MXN')).not.toHaveLength(0);
    expect(screen.getAllByText('USD')).not.toHaveLength(0);
    expect(screen.getAllByText(formatMoneyFromMinor(25_000, 'USD', 'en'))).not.toHaveLength(0);
    expect(screen.getAllByText(formatMoneyFromMinor(24_000, 'USD', 'en'))).not.toHaveLength(0);
    expect(
      screen.getAllByRole('columnheader', { name: labels.currencyHeader })[0],
    ).toHaveClass('whitespace-nowrap');
    expect(
      screen.getAllByRole('columnheader', { name: labels.organizerGrossHeader })[0],
    ).toHaveClass('whitespace-nowrap');

    expect(screen.getByText(labels.traceabilityTitle)).toBeInTheDocument();
    expect(screen.getByText(labels.traceabilityExcludedLabel)).toBeInTheDocument();
    expect(screen.getAllByText('4')).not.toHaveLength(0);
    expect(screen.getAllByText('1')).not.toHaveLength(0);
    expect(screen.getByText('Showing 3 sampled traces out of 4.')).toBeInTheDocument();
    expect(screen.getByText('trace-1')).toBeInTheDocument();
    expect(screen.getByText('trace-bad-1')).toBeInTheDocument();

    expect(screen.getByText(labels.topOrganizersTitle)).toBeInTheDocument();
    expect(screen.getAllByText('Organizer One')).not.toHaveLength(0);
    expect(screen.getAllByText('Organizer Two')).not.toHaveLength(0);
    expect(screen.getByText('Showing 3-4 of 5 organizers')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: labels.firstPageLabel })).toHaveAttribute(
      'href',
      '?workspace=volume&range=30d&organizerPage=1',
    );
    expect(screen.getByRole('link', { name: labels.previousPageLabel })).toHaveAttribute(
      'href',
      '?workspace=volume&range=30d&organizerPage=1',
    );
    expect(screen.getByRole('link', { name: labels.nextPageLabel })).toHaveAttribute(
      'href',
      '?workspace=volume&range=30d&organizerPage=3',
    );
    expect(screen.getByRole('link', { name: labels.lastPageLabel })).toHaveAttribute(
      'href',
      '?workspace=volume&range=30d&organizerPage=3',
    );
    expect(screen.getByRole('link', { name: labels.investigationActionLabel })).toHaveAttribute(
      'href',
      '?workspace=investigation&range=30d&investigationTool=lookup',
    );
    expect(screen.getAllByRole('link', { name: labels.organizerActionLabel })[0]).toHaveAttribute(
      'href',
      '?workspace=investigation&range=30d&investigationTool=trace&evidenceTraceId=org-1-trace',
    );
  });

  it('renders the empty breakdown state when no currency or organizer rows exist', () => {
    render(
      <PaymentCaptureVolumeDashboard
        locale="en"
        metrics={{
          ...metrics,
          currencies: [],
          organizers: [],
          organizerPagination: {
            page: 1,
            pageSize: 5,
            total: 0,
            pageCount: 0,
          },
        }}
        labels={labels}
        queryState={{ workspace: 'volume', range: '30d' }}
      />,
    );

    expect(screen.getByText(labels.emptyCurrencies)).toBeInTheDocument();
    expect(screen.getByText(labels.organizerEmpty)).toBeInTheDocument();
  });
});
