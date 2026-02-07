import { CaptureBibEntryList } from '@/components/results/organizer/capture-bib-entry-list';
import { fireEvent, render, screen, within } from '@testing-library/react';

const storageKey = 'results.capture.offline.test';

const labels = {
  title: 'Offline bib capture',
  description: 'Capture entries while offline.',
  connectivityLabel: 'Connectivity',
  connectivityOnline: 'Online',
  connectivityOffline: 'Offline',
  reassuranceSavedLocally: 'Saved locally',
  reassuranceNotPublic: 'Not public yet',
  reassurancePendingSync: '{count} entries pending sync',
  bibLabel: 'Bib number',
  bibPlaceholder: 'e.g. 245',
  timeLabel: 'Finish time',
  timePlaceholder: 'HH:MM:SS or MM:SS',
  statusLabel: 'Result status',
  submitAction: 'Save draft entry',
  validationBibRequired: 'Bib required',
  validationFinishTimeInvalid: 'Finish time invalid',
  entrySaved: 'Entry saved locally in draft state.',
  entriesTitle: 'Draft preview from offline capture',
  entriesDescription: 'Description',
  entriesEmpty: 'No entries',
  syncTitle: 'Deterministic sync',
  syncDescription: 'Sync description',
  syncAction: 'Run sync',
  syncOfflineGuard: 'Reconnect before running sync.',
  syncProgressMessage: 'Synced {processed} entries. {remaining} entries remain pending.',
  syncCompleteMessage: 'All pending entries were synced without duplication.',
  syncInterruptedMessage:
    'Sync checkpoint saved after {processed} entries. Retry to continue the remaining {remaining}.',
  syncBlockedByConflicts:
    'Resolve all pending conflicts before sync can complete.',
  conflictTitle: 'Conflict review',
  conflictDescription:
    'Choose an explicit outcome for each conflict before finalizing sync.',
  conflictEmpty: 'No conflicts found.',
  conflictNeedsDecision: 'Resolution required',
  conflictResolved: 'Resolution selected',
  conflictLocalValues: 'Local values',
  conflictServerValues: 'Server values',
  conflictFieldBib: 'Bib',
  conflictFieldStatus: 'Status',
  conflictFieldFinishTime: 'Finish time',
  conflictFieldUpdatedAt: 'Updated at',
  conflictActionKeepLocal: 'Keep local',
  conflictActionKeepServer: 'Keep server',
  conflictChoiceKeepLocal: 'Keeping local values',
  conflictChoiceKeepServer: 'Keeping server values',
  headers: {
    bib: 'Bib',
    status: 'Status',
    syncStatus: 'Sync state',
    finishTime: 'Finish time',
    derivedOverall: 'Derived overall place',
    capturedAt: 'Captured at',
    provenance: 'Provenance',
  },
  statusOptions: {
    finish: 'Finish',
    dnf: 'DNF',
    dns: 'DNS',
    dq: 'DQ',
  },
  provenanceSession: 'Session',
  provenanceDevice: 'Device',
  provenanceEditor: 'Editor',
  syncStatusPending: 'Pending sync',
  syncStatusSynced: 'Synced',
  syncStatusConflict: 'Conflict',
  safeNextDetails: {
    title: 'SAFE -> NEXT -> DETAILS',
    safe: 'SAFE',
    next: 'NEXT',
    details: 'DETAILS',
    safeMessage:
      'Draft records remain protected while conflicts are unresolved.',
    nextMessage: 'Select an explicit resolution for each conflict and rerun sync.',
    detailConflictSummary: '{count} conflicts require organizer action.',
    detailDraftProtection: 'Official results remain unchanged until sync is finalized.',
  },
} as const;

function setOnlineState(isOnline: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: isOnline,
  });
}

function renderComponent() {
  return render(
    <CaptureBibEntryList storageKey={storageKey} locale="en-US" labels={labels} />,
  );
}

function saveEntry(params: { bib: string; time?: string; status?: 'Finish' | 'DNF' | 'DNS' | 'DQ' }) {
  fireEvent.change(screen.getByLabelText(labels.bibLabel), {
    target: { value: params.bib },
  });
  fireEvent.change(screen.getByLabelText(labels.timeLabel), {
    target: { value: params.time ?? '' },
  });

  if (params.status) {
    fireEvent.click(screen.getByRole('button', { name: params.status }));
  }

  fireEvent.click(screen.getByRole('button', { name: labels.submitAction }));
}

describe('CaptureBibEntryList', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setOnlineState(false);
  });

  it('persists entries locally and keeps unsynced count visible', () => {
    const { unmount } = renderComponent();

    expect(screen.getByText(labels.connectivityOffline)).toBeInTheDocument();

    saveEntry({ bib: '101', time: '00:24:10', status: 'Finish' });

    expect(screen.getByText(labels.entrySaved)).toBeInTheDocument();
    expect(screen.getByText('1 entries pending sync')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();

    unmount();
    renderComponent();

    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('1 entries pending sync')).toBeInTheDocument();
  });

  it('preserves DNF, DNS, and DQ status labels in preview', () => {
    renderComponent();

    saveEntry({ bib: '201', status: 'DNF' });
    saveEntry({ bib: '202', status: 'DNS' });
    saveEntry({ bib: '203', status: 'DQ' });

    const dnfRow = screen.getByText('201').closest('tr');
    const dnsRow = screen.getByText('202').closest('tr');
    const dqRow = screen.getByText('203').closest('tr');

    if (!dnfRow || !dnsRow || !dqRow) {
      throw new Error('Expected captured rows were not rendered.');
    }

    expect(within(dnfRow).getByText('DNF')).toBeInTheDocument();
    expect(within(dnsRow).getByText('DNS')).toBeInTheDocument();
    expect(within(dqRow).getByText('DQ')).toBeInTheDocument();
  });

  it('derives placement for finish rows and excludes DNF from ranking', () => {
    renderComponent();

    saveEntry({ bib: '301', time: '00:24:10', status: 'Finish' });
    saveEntry({ bib: '302', time: '00:23:05', status: 'Finish' });
    saveEntry({ bib: '303', status: 'DNF' });

    const firstFinishRow = screen.getByText('301').closest('tr');
    const secondFinishRow = screen.getByText('302').closest('tr');
    const dnfRow = screen.getByText('303').closest('tr');

    if (!firstFinishRow || !secondFinishRow || !dnfRow) {
      throw new Error('Expected captured rows were not rendered.');
    }

    expect(within(firstFinishRow).getAllByRole('cell')[4]).toHaveTextContent('2');
    expect(within(secondFinishRow).getAllByRole('cell')[4]).toHaveTextContent('1');
    expect(within(dnfRow).getAllByRole('cell')[4]).toHaveTextContent('-');
  });

  it('syncs idempotently and resumes from checkpoint on retry', () => {
    setOnlineState(true);
    renderComponent();

    saveEntry({ bib: '401', time: '00:23:10', status: 'Finish' });
    saveEntry({ bib: '402', time: '00:24:10', status: 'Finish' });
    saveEntry({ bib: '403', status: 'DNF' });
    saveEntry({ bib: '404', time: '00:26:10', status: 'Finish' });

    fireEvent.click(screen.getByRole('button', { name: labels.syncAction }));
    expect(screen.getByText('Sync checkpoint saved after 3 entries. Retry to continue the remaining 1.')).toBeInTheDocument();
    expect(screen.getByText('1 entries pending sync')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: labels.syncAction }));
    expect(
      screen.getByText('All pending entries were synced without duplication.'),
    ).toBeInTheDocument();
    expect(screen.getByText('0 entries pending sync')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: labels.syncAction }));
    expect(
      screen.getByText('All pending entries were synced without duplication.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Synced').length).toBeGreaterThanOrEqual(4);
  });

  it('shows local-vs-server conflict review and requires explicit resolution before completion', () => {
    setOnlineState(true);
    renderComponent();

    saveEntry({ bib: '501', time: '00:30:00', status: 'Finish' });
    fireEvent.click(screen.getByRole('button', { name: labels.syncAction }));
    expect(screen.getByText(labels.syncCompleteMessage)).toBeInTheDocument();

    saveEntry({ bib: '501', time: '00:28:30', status: 'Finish' });
    fireEvent.click(screen.getByRole('button', { name: labels.syncAction }));

    expect(screen.getByText(labels.syncBlockedByConflicts)).toBeInTheDocument();
    expect(screen.getByText(labels.conflictTitle)).toBeInTheDocument();
    expect(screen.getByText(labels.conflictLocalValues)).toBeInTheDocument();
    expect(screen.getByText(labels.conflictServerValues)).toBeInTheDocument();
    expect(screen.getByText(labels.safeNextDetails.safe)).toBeInTheDocument();
    expect(screen.getByText(labels.safeNextDetails.next)).toBeInTheDocument();
    expect(screen.getByText(labels.safeNextDetails.details)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: labels.conflictActionKeepLocal }));
    expect(screen.getByText(labels.conflictChoiceKeepLocal)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: labels.syncAction }));
    expect(screen.getByText(labels.syncCompleteMessage)).toBeInTheDocument();
    expect(screen.getByText('0 entries pending sync')).toBeInTheDocument();
  });
});
