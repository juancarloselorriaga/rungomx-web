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

jest.mock('@/components/results/organizer/organizer-results-lane', () => ({
  OrganizerResultsLane: () => <div data-testid="organizer-results-lane" />,
}));

jest.mock(
  '@/app/[locale]/(protected)/dashboard/events/[eventId]/results/_results-workspace',
  () => ({
    getResultsWorkspacePageData: jest.fn(async () => ({
      userScopeKey: 'user-1',
      densityStorageKey: 'results.density.user-1.edition-1',
      railState: {
        lifecycle: 'draft',
        connectivity: 'online',
        unsyncedCount: 0,
        nextActionKey: 'reviewDraft',
      },
      nextActionHref: '/dashboard/events/edition-1/results/review',
      versionVisibility: {
        activeOfficialVersionId: null,
        items: [],
      },
      rows: [],
      reviewSummary: null,
      feedbackItems: [],
      labels: {
        stateRail: {
          title: 'Publish status',
          description: 'Summary',
          lifecycle: 'Lifecycle',
          lifecycleDraft: 'Draft',
          lifecycleOfficial: 'Official',
          lifecycleDraftHint: 'Draft',
          lifecycleOfficialHint: 'Official',
          connectivity: 'Connectivity',
          connectivityOnline: 'Online',
          connectivityOffline: 'Offline',
          connectivityOnlineHint: 'Online',
          connectivityOfflineHint: 'Offline',
          unsyncedCount: 'Unsynced',
          nextAction: 'Next action',
          nextActionSyncPending: 'Sync',
          nextActionReviewDraft: 'Review',
          nextActionReadyToPublish: 'Publish',
          nextActionStartIngestion: 'Start',
        },
        versionVisibility: {
          title: 'Versions',
          description: 'Description',
          empty: 'Empty',
          noOfficialVersion: 'No official version',
          activeOfficialLabel: 'Active',
          activeMarker: 'Active',
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
          unknownFinalizedAt: 'Unknown',
          unknownFinalizedBy: 'Unknown',
        },
        table: {
          title: 'Table',
          description: 'Table description',
          empty: 'Empty',
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
            pendingSync: 'Pending',
            conflict: 'Conflict',
          },
          validationState: {
            clear: 'Clear',
            warning: 'Warning',
            blocker: 'Blocker',
          },
        },
        reviewGate: {
          title: 'Gate',
          description: 'Gate description',
          attemptProceedAction: 'Proceed',
          finalizePendingAction: 'Publishing',
          proceedBlockedMessage: 'Blocked',
          proceedReadyMessage: 'Ready',
          proceedUnavailableMessage: 'Unavailable',
          finalizeSuccessMessage: 'Published',
          finalizeFailurePrefix: 'Failed',
          nextRequiredActionLabel: 'Next action',
          issueListTitle: 'Issues',
          issueListDescription: 'Issue description',
          issueListEmpty: 'Empty',
          blockerCountLabel: 'Blockers',
          warningCountLabel: 'Warnings',
          rowCountLabel: 'Rows',
          issueSeverity: { blocker: 'Blocker', warning: 'Warning' },
          issueFields: { bib: 'Bib', runner: 'Runner', guidance: 'Guidance' },
          remediationAction: { capture: 'Capture', import: 'Import' },
        },
        feedback: {
          heading: 'Guidance',
          safe: 'Safe',
          next: 'Next',
          details: 'Details',
        },
      },
    })),
  }),
);

jest.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, string | number>) =>
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
    expect(diffLink).toHaveAttribute('href', '?fromVersionId=version-1&toVersionId=version-2');
    expect(screen.getByRole('heading', { name: 'audit.title' })).toBeInTheDocument();
    expect(screen.getAllByText('audit.actions.results.correction.publish').length).toBeGreaterThan(
      0,
    );
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
