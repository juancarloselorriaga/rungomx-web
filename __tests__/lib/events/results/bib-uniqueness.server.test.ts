import { findConflictingNullDistanceBib } from '@/lib/events/results/shared/bib-uniqueness';

// The helper takes the transaction client as a parameter and only calls
// `tx.query.resultEntries.findMany`. The real drizzle operators build query fragments the
// fake findMany ignores, so no database or `@/db` mock is needed here.
function makeTx(rows: Array<{ bibNumber: string | null }>) {
  const findMany = jest.fn(async () => rows);
  return {
    tx: { query: { resultEntries: { findMany } } } as never,
    findMany,
  };
}

describe('findConflictingNullDistanceBib', () => {
  it('returns the first incoming bib that collides with a stored distance-less entry', async () => {
    const { tx } = makeTx([{ bibNumber: '77' }]);

    const conflict = await findConflictingNullDistanceBib(tx, {
      resultVersionId: 'version-1',
      bibNumbers: ['12', '77'],
    });

    expect(conflict).toBe('77');
  });

  it('returns null when no stored distance-less entry collides', async () => {
    const { tx } = makeTx([]);

    const conflict = await findConflictingNullDistanceBib(tx, {
      resultVersionId: 'version-1',
      bibNumbers: ['12', '77'],
    });

    expect(conflict).toBeNull();
  });

  it('skips the query and returns null when there are no usable bibs', async () => {
    const { tx, findMany } = makeTx([]);

    const conflict = await findConflictingNullDistanceBib(tx, {
      resultVersionId: 'version-1',
      bibNumbers: ['', '   '],
    });

    expect(conflict).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('trims incoming bibs before comparing against stored entries', async () => {
    const { tx } = makeTx([{ bibNumber: '77' }]);

    const conflict = await findConflictingNullDistanceBib(tx, {
      resultVersionId: 'version-1',
      bibNumbers: ['  77  '],
    });

    expect(conflict).toBe('77');
  });
});
