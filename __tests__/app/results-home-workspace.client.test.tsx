import { render, screen } from '@testing-library/react';

import { ResultsHomeWorkspace } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/results/_results-home-workspace';

jest.mock('@/components/results/primitives/results-state-rail', () => ({
  ResultsStateRail: () => <div data-testid="results-state-rail" />,
}));

jest.mock('@/components/results/organizer/results-version-visibility-panel', () => ({
  ResultsVersionVisibilityPanel: () => <div data-testid="results-version-visibility-panel" />,
}));

jest.mock('@/components/results/organizer/table-pro-results-grid', () => ({
  TableProResultsGrid: () => <div data-testid="results-draft-grid" />,
}));

jest.mock('@/components/results/primitives/safe-next-details-message', () => ({
  SafeNextDetailsMessage: ({ safe, next }: { safe: string; next: string }) => (
    <div>
      <span>{safe}</span>
      <span>{next}</span>
    </div>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ asChild, children, ...props }: { asChild?: boolean; children: React.ReactNode }) =>
    asChild ? <>{children}</> : <button {...props}>{children}</button>,
}));

jest.mock('@/components/ui/surface', () => ({
  Surface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  InsetSurface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  MutedSurface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: unknown }) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

describe('ResultsHomeWorkspace', () => {
  it('prioritizes the next step and groups draft creation separately from supporting work', () => {
    render(
      <ResultsHomeWorkspace
        eventId="event-123"
        pageData={{
          userScopeKey: 'user-1',
          densityStorageKey: 'results.density.user-1.event-123',
          railState: {
            lifecycle: 'draft',
            connectivity: 'online',
            unsyncedCount: 0,
            nextActionKey: 'reviewDraft',
          },
          nextActionHref: {
            pathname: '/dashboard/events/[eventId]/results/review',
            params: { eventId: 'event-123' },
          },
          versionVisibility: {
            activeOfficialVersionId: null,
            items: [],
          },
          rows: [],
          reviewSummary: null,
          feedbackItems: [
            {
              id: 'warning-1',
              tone: 'warning',
              safe: 'Draft is protected.',
              next: 'Review warnings.',
              details: ['One warning is still open.'],
            },
          ],
          labels: {
            stateRail: {
              title: 'Publish status',
              description: 'Keep your draft status visible.',
              lifecycle: 'Lifecycle',
              lifecycleDraft: 'Draft',
              lifecycleOfficial: 'Official',
              lifecycleDraftHint: 'Not public yet.',
              lifecycleOfficialHint: 'Publicly visible.',
              connectivity: 'Connectivity',
              connectivityOnline: 'Online',
              connectivityOffline: 'Offline',
              connectivityOnlineHint: 'Ready to sync.',
              connectivityOfflineHint: 'Saved locally.',
              unsyncedCount: 'Unsynced entries',
              nextAction: 'Next action',
              nextActionSyncPending: 'Sync pending draft rows',
              nextActionReviewDraft: 'Review and publish',
              nextActionReadyToPublish: 'Publish official results',
              nextActionStartIngestion: 'Start a new draft',
            },
            versionVisibility: {
              title: 'Published versions',
              description: 'Recent versions',
              empty: 'No versions yet',
              noOfficialVersion: 'No official version yet',
              activeOfficialLabel: 'Active official version',
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
              unknownFinalizedAt: 'Not finalized',
              unknownFinalizedBy: 'Unknown',
            },
            table: {
              title: 'Draft results table',
              description: 'Recent rows',
              empty: 'No draft rows yet',
              headers: {
                bib: 'Bib',
                runner: 'Runner',
                validation: 'Validation',
                resultStatus: 'Status',
                syncStatus: 'Sync',
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
            },
            reviewGate: {
              title: 'Finalization readiness gate',
              description: 'Review blockers',
              attemptProceedAction: 'Attempt proceed',
              finalizePendingAction: 'Publishing...',
              proceedBlockedMessage: 'Blocked',
              proceedReadyMessage: 'Ready',
              proceedUnavailableMessage: 'Unavailable',
              finalizeSuccessMessage: 'Published',
              finalizeFailurePrefix: 'Failed:',
              nextRequiredActionLabel: 'Next action',
              issueListTitle: 'Issue navigation',
              issueListDescription: 'Open the matching page',
              issueListEmpty: 'No issues',
              blockerCountLabel: 'Blockers',
              warningCountLabel: 'Warnings',
              rowCountLabel: 'Rows',
              issueSeverity: {
                blocker: 'Blocker',
                warning: 'Warning',
              },
              issueFields: {
                bib: 'Bib',
                runner: 'Runner',
                guidance: 'Guidance',
              },
              remediationAction: {
                capture: 'Open capture',
                import: 'Open import',
              },
            },
            feedback: {
              heading: 'Race Director guidance',
              safe: 'Status',
              next: 'Next step',
              details: 'Details',
            },
          },
        }}
        labels={{
          nextStepEyebrow: 'Next step',
          nextStepTitle: 'What to do now',
          nextStepDescriptions: {
            syncPending: 'Sync pending draft rows first.',
            reviewDraft: 'Review the draft before publishing.',
            readyToPublish: 'Publish official results when ready.',
            startIngestion: 'Start a new draft.',
          },
          draftSources: {
            title: 'Create or update a draft',
            description: 'Choose how you want to build the draft.',
            captureTitle: 'Manual capture',
            captureDescription: 'Record results from the course.',
            importTitle: 'File import',
            importDescription: 'Upload CSV or Excel files.',
          },
          publishReadiness: {
            title: 'Review and publish context',
            description: 'Keep status and version history visible.',
          },
          draftSnapshot: {
            title: 'Current draft snapshot',
            description: 'See recent draft rows.',
          },
          supportingOps: {
            title: 'Supporting work after publication',
            description: 'Use these after the main draft workflow.',
            correctionsTitle: 'Corrections',
            correctionsDescription: 'Handle follow-up requests.',
            investigationTitle: 'Investigation',
            investigationDescription: 'Review deeper audit context.',
          },
          actions: {
            capture: 'Open capture',
            import: 'Open import',
            corrections: 'Open corrections',
            investigation: 'Open investigation',
          },
        }}
      />,
    );

    expect(screen.getByText('What to do now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Review and publish/i })).toBeInTheDocument();
    expect(screen.getByText('Create or update a draft')).toBeInTheDocument();
    expect(screen.getByText('Review and publish context')).toBeInTheDocument();
    expect(screen.getByText('Supporting work after publication')).toBeInTheDocument();
    expect(screen.getByText('Manual capture')).toBeInTheDocument();
    expect(screen.getByText('File import')).toBeInTheDocument();
    expect(screen.getByText('Corrections')).toBeInTheDocument();
    expect(screen.getByText('Investigation')).toBeInTheDocument();
    expect(screen.getByTestId('results-state-rail')).toBeInTheDocument();
    expect(screen.getByTestId('results-version-visibility-panel')).toBeInTheDocument();
    expect(screen.getByTestId('results-draft-grid')).toBeInTheDocument();
  });
});
