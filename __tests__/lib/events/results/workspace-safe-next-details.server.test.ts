import {
  getSafeNextDetailsFeedback,
  type OrganizerDraftReviewSummary,
  type OrganizerResultsRow,
} from '@/lib/events/results/workspace';

function createRow(
  overrides: Partial<OrganizerResultsRow> & Pick<OrganizerResultsRow, 'id' | 'runnerName'>,
): OrganizerResultsRow {
  return {
    id: overrides.id,
    bibNumber: overrides.bibNumber ?? null,
    runnerName: overrides.runnerName,
    sourceLane: overrides.sourceLane ?? 'csv_excel',
    resultStatus: overrides.resultStatus ?? 'finish',
    validationState: overrides.validationState ?? 'clear',
    syncStatus: overrides.syncStatus ?? 'synced',
    finishTimeMillis: overrides.finishTimeMillis ?? 1_800_000,
    updatedAt: overrides.updatedAt ?? new Date('2026-02-07T12:00:00.000Z'),
    details: overrides.details ?? 'Draft row',
  };
}

const baseRailState = {
  lifecycle: 'draft',
  connectivity: 'online',
  unsyncedCount: 0,
  nextActionKey: 'reviewDraft',
} as const;

describe('getSafeNextDetailsFeedback', () => {
  it('suppresses feedback when lane is green (no conflicts/blockers/warnings)', () => {
    const feedback = getSafeNextDetailsFeedback({
      lane: 'import',
      railState: baseRailState,
      rows: [
        createRow({
          id: 'row-clear',
          runnerName: 'Runner Clear',
          syncStatus: 'synced',
          validationState: 'clear',
        }),
      ],
      reviewSummary: null,
    });

    expect(feedback).toEqual([]);
  });

  it('returns a pending sync message for capture when unsyncedCount > 0', () => {
    const feedback = getSafeNextDetailsFeedback({
      lane: 'capture',
      railState: { ...baseRailState, unsyncedCount: 2, nextActionKey: 'syncPending' },
      rows: [],
      reviewSummary: null,
    });

    expect(feedback).toHaveLength(1);
    expect(feedback[0]?.id).toBe('capture-sync-pending');
    expect(feedback[0]?.tone).toBe('warning');
    expect(feedback[0]?.details.join(' ')).toContain('2');
  });

  it('returns an empty-draft review message when there are no draft rows', () => {
    const summary: OrganizerDraftReviewSummary = {
      rowCount: 0,
      blockerCount: 0,
      warningCount: 0,
      canProceed: false,
      issues: [],
      nextRequiredAction: null,
      validationStateByRowId: {},
    };

    const feedback = getSafeNextDetailsFeedback({
      lane: 'review',
      railState: { ...baseRailState, nextActionKey: 'readyToPublish' },
      rows: [],
      reviewSummary: summary,
    });

    expect(feedback).toHaveLength(1);
    expect(feedback[0]?.id).toBe('review-empty');
    expect(feedback[0]?.tone).toBe('info');
  });

  it('returns a blockers review message when blockers exist', () => {
    const summary: OrganizerDraftReviewSummary = {
      rowCount: 3,
      blockerCount: 1,
      warningCount: 2,
      canProceed: false,
      issues: [],
      nextRequiredAction: null,
      validationStateByRowId: {},
    };

    const feedback = getSafeNextDetailsFeedback({
      lane: 'review',
      railState: { ...baseRailState, nextActionKey: 'readyToPublish' },
      rows: [
        createRow({ id: 'row-1', runnerName: 'Runner One', validationState: 'blocker' }),
        createRow({ id: 'row-2', runnerName: 'Runner Two', validationState: 'warning' }),
      ],
      reviewSummary: summary,
    });

    expect(feedback).toHaveLength(1);
    expect(feedback[0]?.id).toBe('review-blockers');
    expect(feedback[0]?.tone).toBe('danger');
    expect(feedback[0]?.details.join(' ')).toContain('1 blocker');
  });
});

