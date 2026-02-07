import {
  buildOrganizerDraftReviewSummary,
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

describe('buildOrganizerDraftReviewSummary', () => {
  it('flags blocker issues and blocks proceed when unresolved blockers exist', () => {
    const summary = buildOrganizerDraftReviewSummary('edition-1', [
      createRow({
        id: 'row-conflict',
        runnerName: 'Runner Conflict',
        sourceLane: 'manual_offline',
        syncStatus: 'conflict',
      }),
      createRow({
        id: 'row-warning',
        runnerName: 'Runner Warning',
        sourceLane: 'csv_excel',
        resultStatus: 'dns',
        finishTimeMillis: 1_900_000,
      }),
    ]);

    expect(summary.rowCount).toBe(2);
    expect(summary.blockerCount).toBeGreaterThanOrEqual(1);
    expect(summary.warningCount).toBeGreaterThanOrEqual(1);
    expect(summary.canProceed).toBe(false);
    expect(summary.nextRequiredAction?.severity).toBe('blocker');
    expect(summary.nextRequiredAction?.remediationLane).toBe('capture');
    expect(summary.validationStateByRowId['row-conflict']).toBe('blocker');
    expect(summary.validationStateByRowId['row-warning']).toBe('warning');
  });

  it('allows proceed when rows are clear and no blockers remain', () => {
    const summary = buildOrganizerDraftReviewSummary('edition-2', [
      createRow({
        id: 'row-clear-1',
        runnerName: 'Runner One',
      }),
      createRow({
        id: 'row-clear-2',
        runnerName: 'Runner Two',
        sourceLane: 'manual_offline',
      }),
    ]);

    expect(summary.blockerCount).toBe(0);
    expect(summary.warningCount).toBe(0);
    expect(summary.canProceed).toBe(true);
    expect(summary.nextRequiredAction).toBeNull();
    expect(summary.issues).toHaveLength(0);
  });
});
