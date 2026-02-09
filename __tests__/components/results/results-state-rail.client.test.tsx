import { ResultsStateRail } from '@/components/results/primitives/results-state-rail';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string | { pathname: string; params?: Record<string, string> };
  }) => {
    const resolvedHref =
      typeof href === 'string'
        ? href
        : Object.entries(href.params ?? {}).reduce(
            (pathname, [key, value]) => pathname.replace(`[${key}]`, value),
            href.pathname,
          );
    return (
      <a href={resolvedHref} {...props}>
        {children}
      </a>
    );
  },
}));

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

  it('renders Next action as a link/button when nextActionHref is provided', () => {
    render(
      <ResultsStateRail
        state={{
          lifecycle: 'draft',
          connectivity: 'offline',
          unsyncedCount: 3,
          nextActionKey: 'syncPending',
        }}
        nextActionHref={{
          pathname: '/dashboard/events/[eventId]/results/capture',
          params: { eventId: 'event-123' },
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

    const link = screen.getByRole('link', { name: 'Sync pending draft rows' });
    expect(link).toHaveAttribute('href', '/dashboard/events/event-123/results/capture');
  });
});
