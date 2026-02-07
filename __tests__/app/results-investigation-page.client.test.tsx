import { render, screen } from '@testing-library/react';

const mockGetInternalResultsInvestigationViewData = jest.fn();
const mockListResultTrustAuditLogsForEdition = jest.fn();

jest.mock('@/lib/events/results/queries', () => ({
  getInternalResultsInvestigationViewData: (...args: unknown[]) =>
    mockGetInternalResultsInvestigationViewData(...args),
  listResultTrustAuditLogsForEdition: (...args: unknown[]) =>
    mockListResultTrustAuditLogsForEdition(...args),
}));

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: async () =>
    (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  setRequestLocale: jest.fn(),
}));

import ResultsInvestigationPage from '@/app/[locale]/(protected)/dashboard/events/[eventId]/results/investigation/page';

describe('results investigation page', () => {
  beforeEach(() => {
    mockGetInternalResultsInvestigationViewData.mockReset();
    mockListResultTrustAuditLogsForEdition.mockReset();
    mockGetInternalResultsInvestigationViewData.mockResolvedValue({
      editionId: 'edition-1',
      versions: [
        {
          id: 'version-2',
          versionNumber: 2,
          status: 'corrected',
          source: 'correction',
          parentVersionId: 'version-1',
          createdAt: new Date('2026-08-20T12:00:00.000Z'),
          finalizedAt: new Date('2026-08-20T13:00:00.000Z'),
          createdByUserId: 'user-created',
          createdByDisplayName: 'Creator',
          finalizedByUserId: 'user-finalized',
          finalizedByDisplayName: 'Approver',
          sourceReference: 'source-version-2',
          sourceFileChecksum: 'checksum-version-2',
          provenanceJson: {},
          ingestion: {
            sessionId: 'session-version-2',
            sourceLane: 'csv_excel',
            startedAt: new Date('2026-08-20T12:00:00.000Z'),
            startedByUserId: 'user-starter',
            startedByDisplayName: 'Starter',
            sourceReference: 'ingestion-version-2',
            sourceFileChecksum: 'ingestion-checksum-version-2',
            provenanceJson: {},
          },
        },
      ],
      corrections: [
        {
          requestId: 'request-1',
          sourceResultVersionId: 'version-1',
          correctedResultVersionId: 'version-2',
          reason: 'Timing correction',
          requestedAt: new Date('2026-08-20T11:00:00.000Z'),
          reviewedAt: new Date('2026-08-20T12:30:00.000Z'),
          publishedAt: new Date('2026-08-20T13:10:00.000Z'),
          requestedByUserId: 'user-runner',
          requestedByDisplayName: 'Runner',
          reviewedByUserId: 'user-approver',
          reviewedByDisplayName: 'Approver',
        },
      ],
      selectedDiff: {
        fromVersionId: 'version-1',
        toVersionId: 'version-2',
        fromVersionNumber: 1,
        toVersionNumber: 2,
        fromStatus: 'official',
        toStatus: 'corrected',
        fromSource: 'csv_excel',
        toSource: 'correction',
        approverUserId: 'user-approver',
        approverDisplayName: 'Approver',
        reviewedAt: new Date('2026-08-20T12:30:00.000Z'),
        publishedAt: new Date('2026-08-20T13:10:00.000Z'),
        reason: 'Timing correction',
      },
    });
    mockListResultTrustAuditLogsForEdition.mockResolvedValue([
      {
        id: 'audit-1',
        organizationId: 'org-1',
        actorUserId: 'user-approver',
        actorDisplayName: 'Approver',
        action: 'results.correction.publish',
        entityType: 'result_correction_request',
        entityId: 'request-1',
        editionId: 'edition-1',
        createdAt: new Date('2026-08-20T13:10:00.000Z'),
        beforeJson: { editionId: 'edition-1' },
        afterJson: { editionId: 'edition-1' },
      },
    ]);
  });

  it('renders selected diff and correction links from URL-driven context', async () => {
    const ui = await ResultsInvestigationPage({
      params: Promise.resolve({ locale: 'en' as const, eventId: 'edition-1' }),
      searchParams: Promise.resolve({
        fromVersionId: 'version-1',
        toVersionId: 'version-2',
      }),
    });
    render(ui);

    expect(mockGetInternalResultsInvestigationViewData).toHaveBeenCalledWith({
      editionId: 'edition-1',
      fromVersionId: 'version-1',
      toVersionId: 'version-2',
    });
    expect(mockListResultTrustAuditLogsForEdition).toHaveBeenCalledWith({
      editionId: 'edition-1',
      action: undefined,
      createdFrom: undefined,
      createdTo: undefined,
      limit: 80,
    });
    expect(screen.getByText('selectedDiff.title')).toBeInTheDocument();
    expect(screen.getByText('request-1')).toBeInTheDocument();
    const diffLink = screen.getByRole('link', {
      name: 'corrections.viewDiff',
    });
    expect(diffLink).toHaveAttribute(
      'href',
      '?fromVersionId=version-1&toVersionId=version-2',
    );
    expect(screen.getByText('audit.title')).toBeInTheDocument();
    expect(
      screen.getAllByText('audit.actions.results.correction.publish').length,
    ).toBeGreaterThan(0);
  });

  it('passes audit action and date filters to the audit log query', async () => {
    const ui = await ResultsInvestigationPage({
      params: Promise.resolve({ locale: 'en' as const, eventId: 'edition-1' }),
      searchParams: Promise.resolve({
        auditAction: 'results.version.finalize',
        auditFrom: '2026-08-01',
        auditTo: '2026-08-31',
      }),
    });
    render(ui);

    expect(mockListResultTrustAuditLogsForEdition).toHaveBeenCalledWith({
      editionId: 'edition-1',
      action: 'results.version.finalize',
      createdFrom: new Date('2026-08-01T00:00:00.000Z'),
      createdTo: new Date('2026-08-31T23:59:59.999Z'),
      limit: 80,
    });
  });
});
