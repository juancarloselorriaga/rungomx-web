import { DraftReviewFinalizationGate } from '@/components/results/organizer/draft-review-finalization-gate';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const mockFinalizeResultVersionAttestation = jest.fn();

jest.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string | { pathname: string; params?: Record<string, string> };
  }) => {
    const resolvedHref = typeof href === 'string' ? href : href.pathname;
    return (
      <a href={resolvedHref} {...props}>
        {children}
      </a>
    );
  },
}));

jest.mock('@/lib/events/results/actions', () => ({
  finalizeResultVersionAttestation: (...args: unknown[]) =>
    mockFinalizeResultVersionAttestation(...args),
}));

const labels = {
  title: 'Finalization readiness gate',
  description: 'Review blockers and warnings before publishing official results.',
  attemptProceedAction: 'Attempt proceed to finalization',
  finalizePendingAction: 'Publishing official version...',
  proceedBlockedMessage: 'Finalization is blocked until all blockers are resolved.',
  proceedReadyMessage: 'No blocking issues found. Draft review is ready for finalization.',
  proceedUnavailableMessage: 'No draft rows are available yet. Start capture or import first.',
  finalizeSuccessMessage: 'Official version published.',
  finalizeFailurePrefix: 'Finalization failed:',
  nextRequiredActionLabel: 'Next required action',
  issueListTitle: 'Issue navigation',
  issueListDescription: 'Open remediation lanes directly.',
  issueListEmpty: 'No unresolved review issues.',
  blockerCountLabel: 'Blockers',
  warningCountLabel: 'Warnings',
  rowCountLabel: 'Draft rows',
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
    capture: 'Open capture lane',
    import: 'Open import lane',
  },
} as const;

describe('DraftReviewFinalizationGate', () => {
  beforeEach(() => {
    mockFinalizeResultVersionAttestation.mockReset();
  });

  it('blocks proceed attempts and shows next required action when blockers exist', () => {
    render(
      <DraftReviewFinalizationGate
        eventId="event-123"
        labels={labels}
        summary={{
          rowCount: 2,
          blockerCount: 1,
          warningCount: 0,
          canProceed: false,
          validationStateByRowId: {
            'row-1': 'blocker',
            'row-2': 'clear',
          },
          nextRequiredAction: {
            id: 'row-1-conflict',
            rowId: 'row-1',
            rowBibNumber: '101',
            rowRunnerName: 'Runner One',
            severity: 'blocker',
            message: 'Conflict resolution is still required for this draft row.',
            guidance: 'Resolve conflict before finalization.',
            remediationLane: 'capture',
          },
          issues: [
            {
              id: 'row-1-conflict',
              rowId: 'row-1',
              rowBibNumber: '101',
              rowRunnerName: 'Runner One',
              severity: 'blocker',
              message: 'Conflict resolution is still required for this draft row.',
              guidance: 'Resolve conflict before finalization.',
              remediationLane: 'capture',
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: labels.attemptProceedAction }));

    expect(screen.getByTestId('draft-review-proceed-feedback')).toHaveTextContent(
      labels.proceedBlockedMessage,
    );
    expect(mockFinalizeResultVersionAttestation).not.toHaveBeenCalled();
    expect(screen.getByText(labels.nextRequiredActionLabel, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: labels.remediationAction.capture })).toBeInTheDocument();
  });

  it('shows ready message and publishes official version when proceed is attempted with no blockers', async () => {
    mockFinalizeResultVersionAttestation.mockResolvedValue({
      ok: true,
      data: {
        resultVersion: { id: 'version-1' },
        gate: {
          rowCount: 1,
          blockerCount: 0,
          warningCount: 0,
          canProceed: true,
        },
      },
    });

    render(
      <DraftReviewFinalizationGate
        eventId="event-321"
        labels={labels}
        summary={{
          rowCount: 1,
          blockerCount: 0,
          warningCount: 0,
          canProceed: true,
          validationStateByRowId: {
            'row-clear': 'clear',
          },
          nextRequiredAction: null,
          issues: [],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: labels.attemptProceedAction }));

    expect(screen.getByTestId('draft-review-proceed-feedback')).toHaveTextContent(
      labels.proceedReadyMessage,
    );

    await waitFor(() => {
      expect(mockFinalizeResultVersionAttestation).toHaveBeenCalledWith({
        editionId: 'event-321',
        attestationConfirmed: true,
      });
    });

    expect(screen.getByTestId('draft-review-finalization-feedback')).toHaveTextContent(
      labels.finalizeSuccessMessage,
    );
  });
});
