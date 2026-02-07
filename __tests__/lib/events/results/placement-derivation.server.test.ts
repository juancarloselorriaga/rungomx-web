import {
  deriveResultPlacements,
  RESULTS_DERIVATION_POLICY_BASELINE,
} from '@/lib/events/results/derivation/placement';

describe('deriveResultPlacements', () => {
  it('computes deterministic overall/gender/age-group placements and excludes non-finish statuses', () => {
    const derived = deriveResultPlacements([
      {
        id: 'entry-a',
        runnerFullName: 'Ana Runner',
        bibNumber: '10',
        status: 'finish',
        finishTimeMillis: 1_000,
        gender: 'female',
        age: 31,
      },
      {
        id: 'entry-b',
        runnerFullName: 'Ben Runner',
        bibNumber: '8',
        status: 'finish',
        finishTimeMillis: 900,
        gender: 'male',
        age: 31,
      },
      {
        id: 'entry-c',
        runnerFullName: 'Cam Runner',
        bibNumber: '11',
        status: 'dnf',
        finishTimeMillis: null,
        gender: 'female',
        age: 31,
      },
      {
        id: 'entry-d',
        runnerFullName: 'Alba Runner',
        bibNumber: '9',
        status: 'finish',
        finishTimeMillis: 1_000,
        gender: 'female',
        age: 36,
      },
    ]);

    expect(derived.byEntryId['entry-b']).toMatchObject({
      overallPlace: 1,
      genderPlace: 1,
      ageGroupPlace: 1,
      genderCategoryKey: 'male',
      ageGroupCategoryKey: '25-34',
    });
    expect(derived.byEntryId['entry-d']).toMatchObject({
      overallPlace: 2,
      genderPlace: 1,
      ageGroupPlace: 1,
      genderCategoryKey: 'female',
      ageGroupCategoryKey: '35-44',
    });
    expect(derived.byEntryId['entry-a']).toMatchObject({
      overallPlace: 3,
      genderPlace: 2,
      ageGroupPlace: 2,
      genderCategoryKey: 'female',
      ageGroupCategoryKey: '25-34',
    });
    expect(derived.byEntryId['entry-c']).toMatchObject({
      overallPlace: null,
      genderPlace: null,
      ageGroupPlace: null,
      genderCategoryKey: 'female',
      ageGroupCategoryKey: '25-34',
    });
  });

  it('returns the same ranking output for identical datasets regardless of input order', () => {
    const dataset = [
      {
        id: 'entry-1',
        runnerFullName: 'Carlos',
        bibNumber: '101',
        status: 'finish' as const,
        finishTimeMillis: 3_500_000,
        gender: 'male',
        age: 42,
      },
      {
        id: 'entry-2',
        runnerFullName: 'Carlos',
        bibNumber: '102',
        status: 'finish' as const,
        finishTimeMillis: 3_500_000,
        gender: 'male',
        age: 42,
      },
      {
        id: 'entry-3',
        runnerFullName: 'Brenda',
        bibNumber: '103',
        status: 'finish' as const,
        finishTimeMillis: 3_400_000,
        gender: 'female',
        age: 29,
      },
    ];

    const forward = deriveResultPlacements(dataset);
    const reversed = deriveResultPlacements([...dataset].reverse());

    expect(forward.byEntryId).toEqual(reversed.byEntryId);
    expect(forward.orderedEntryIds).toEqual(reversed.orderedEntryIds);
  });

  it('applies tie-break sequence: time -> normalized name -> bib -> id', () => {
    const derived = deriveResultPlacements([
      {
        id: 'entry-c',
        runnerFullName: 'Carlos Runner',
        bibNumber: '12',
        status: 'finish',
        finishTimeMillis: 3_500_000,
        gender: 'male',
        age: 33,
      },
      {
        id: 'entry-a',
        runnerFullName: 'Ana Runner',
        bibNumber: '10',
        status: 'finish',
        finishTimeMillis: 3_500_000,
        gender: 'female',
        age: 29,
      },
      {
        id: 'entry-b',
        runnerFullName: 'Ana Runner',
        bibNumber: '11',
        status: 'finish',
        finishTimeMillis: 3_500_000,
        gender: 'female',
        age: 29,
      },
      {
        id: 'entry-z',
        runnerFullName: 'Ana Runner',
        bibNumber: '11',
        status: 'finish',
        finishTimeMillis: 3_500_000,
        gender: 'female',
        age: 29,
      },
    ]);

    expect(derived.orderedEntryIds).toEqual([
      'entry-a',
      'entry-b',
      'entry-z',
      'entry-c',
    ]);
  });

  it('locks timing basis to elapsed-time milliseconds only', () => {
    expect(RESULTS_DERIVATION_POLICY_BASELINE).toMatchObject({
      policyVersion: 'results-derivation-v1',
      timingBasis: 'elapsed_time_millis_only',
      tieBreakSequence: [
        'finish_time_millis_asc',
        'runner_full_name_normalized_asc',
        'bib_number_asc',
        'entry_id_asc',
      ],
    });
  });

  it('prefers explicit age-group hints before numeric age brackets', () => {
    const derived = deriveResultPlacements([
      {
        id: 'entry-hint',
        runnerFullName: 'Hint Runner',
        bibNumber: '300',
        status: 'finish',
        finishTimeMillis: 2_100_000,
        gender: 'female',
        age: 22,
        rawSourceData: {
          ageGroup: 'masters-women',
        },
      },
      {
        id: 'entry-hint-2',
        runnerFullName: 'Second Hint Runner',
        bibNumber: '301',
        status: 'finish',
        finishTimeMillis: 2_150_000,
        gender: 'female',
        age: 48,
        identitySnapshot: {
          ageGroup: 'masters-women',
        },
      },
    ]);

    expect(derived.byEntryId['entry-hint']?.ageGroupCategoryKey).toBe('masters-women');
    expect(derived.byEntryId['entry-hint-2']?.ageGroupCategoryKey).toBe('masters-women');
    expect(derived.byEntryId['entry-hint']?.ageGroupPlace).toBe(1);
    expect(derived.byEntryId['entry-hint-2']?.ageGroupPlace).toBe(2);
  });
});
