import { ResultsStateRail } from '@/components/results/primitives/results-state-rail';
import { render, screen } from '@testing-library/react';

describe('ResultsStateRail', () => {
  it('renders lifecycle, connectivity, unsynced count, and next action labels', () => {
    render(
      <ResultsStateRail
        state={{
          lifecycle: 'draft',
          connectivity: 'offline',
          unsyncedCount: 3,
          nextActionKey: 'syncPending',
        }}
        labels={{
          title: 'Results state rail',
          description: 'State summary',
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
          nextActionReviewDraft: 'Review draft',
          nextActionReadyToPublish: 'Ready to publish',
          nextActionStartIngestion: 'Start ingestion',
        }}
      />,
    );

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Sync pending draft rows')).toBeInTheDocument();
  });
});
