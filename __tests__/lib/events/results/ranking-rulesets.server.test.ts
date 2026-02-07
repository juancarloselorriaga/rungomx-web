const mockRankingRulesetsFindFirst = jest.fn();
const mockRankingRulesetsFindMany = jest.fn();
const mockInsert = jest.fn();
const mockInsertCalls: Array<{ table: unknown; values: unknown }> = [];
const mockInsertReturningQueue: unknown[][] = [];

jest.mock('@/db', () => ({
  db: {
    query: {
      rankingRulesets: {
        findFirst: (...args: unknown[]) => mockRankingRulesetsFindFirst(...args),
        findMany: (...args: unknown[]) => mockRankingRulesetsFindMany(...args),
      },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

import { rankingRulesets } from '@/db/schema';
import {
  publishRankingRuleset,
  resolveRankingRulesetForTimestamp,
  resolveRankingRulesetForTimestampFromCandidates,
} from '@/lib/events/results/rulesets';

function makeRulesetRow(overrides?: Partial<typeof rankingRulesets.$inferSelect>) {
  return {
    id: 'ruleset-1',
    versionTag: 'v1.0.0',
    status: 'active' as const,
    rulesDefinitionJson: { tieBreak: 'elapsed_time_millis_only' },
    explainabilityReference: 'https://example.com/rules/v1.0.0',
    activationStartsAt: new Date('2026-01-01T00:00:00.000Z'),
    activationEndsAt: null,
    publishedByUserId: 'user-1',
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('ranking ruleset model', () => {
  beforeEach(() => {
    mockRankingRulesetsFindFirst.mockReset();
    mockRankingRulesetsFindMany.mockReset();
    mockInsert.mockReset();
    mockInsertCalls.length = 0;
    mockInsertReturningQueue.length = 0;

    mockInsert.mockImplementation((table: unknown) => ({
      values: (values: unknown) => ({
        returning: async () => {
          mockInsertCalls.push({ table, values });
          const next = mockInsertReturningQueue.shift();
          return Array.isArray(next) ? next : [];
        },
      }),
    }));
  });

  it('resolves deterministic ruleset window from unordered candidates', () => {
    const at = new Date('2026-02-15T00:00:00.000Z');
    const candidates = [
      {
        id: 'ruleset-1',
        versionTag: 'v1.0.0',
        activationStartsAt: new Date('2026-01-01T00:00:00.000Z'),
        activationEndsAt: new Date('2026-03-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'ruleset-2',
        versionTag: 'v1.1.0',
        activationStartsAt: new Date('2026-02-01T00:00:00.000Z'),
        activationEndsAt: new Date('2026-04-01T00:00:00.000Z'),
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ];

    const forward = resolveRankingRulesetForTimestampFromCandidates(candidates, at);
    const reversed = resolveRankingRulesetForTimestampFromCandidates([...candidates].reverse(), at);

    expect(forward?.id).toBe('ruleset-2');
    expect(reversed?.id).toBe('ruleset-2');
  });

  it('enforces unique ruleset version tags on publish', async () => {
    mockRankingRulesetsFindFirst.mockResolvedValueOnce({ id: 'existing-ruleset' });

    await expect(
      publishRankingRuleset({
        versionTag: 'v1.0.0',
        activationStartsAt: new Date('2026-01-01T00:00:00.000Z'),
        rulesDefinitionJson: { tieBreak: 'elapsed_time_millis_only' },
      }),
    ).rejects.toThrow('Ranking ruleset version already exists');

    expect(mockInsertCalls).toHaveLength(0);
  });

  it('rejects overlapping activation windows for active rulesets', async () => {
    mockRankingRulesetsFindFirst.mockResolvedValueOnce(null);
    mockRankingRulesetsFindMany.mockResolvedValueOnce([
      {
        id: 'ruleset-1',
        versionTag: 'v1.0.0',
        activationStartsAt: new Date('2026-01-01T00:00:00.000Z'),
        activationEndsAt: new Date('2026-04-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(
      publishRankingRuleset({
        versionTag: 'v1.1.0',
        activationStartsAt: new Date('2026-03-15T00:00:00.000Z'),
        rulesDefinitionJson: { tieBreak: 'elapsed_time_millis_only' },
      }),
    ).rejects.toThrow('Ranking ruleset activation window overlaps with an active ruleset');

    expect(mockInsertCalls).toHaveLength(0);
  });

  it('stores activation metadata and returns normalized version identifier when publishing', async () => {
    mockRankingRulesetsFindFirst.mockResolvedValueOnce(null);
    mockRankingRulesetsFindMany.mockResolvedValueOnce([]);

    mockInsertReturningQueue.push([
      makeRulesetRow({
        id: 'ruleset-2',
        versionTag: 'v1.2.0',
        activationStartsAt: new Date('2026-05-01T00:00:00.000Z'),
        activationEndsAt: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ]);

    const published = await publishRankingRuleset({
      versionTag: ' V1.2.0 ',
      activationStartsAt: new Date('2026-05-01T00:00:00.000Z'),
      activationEndsAt: new Date('2026-07-01T00:00:00.000Z'),
      rulesDefinitionJson: { tieBreak: 'elapsed_time_millis_only' },
      publishedByUserId: 'user-1',
      explainabilityReference: 'https://example.com/rules/v1.2.0',
    });

    expect(published.versionTag).toBe('v1.2.0');
    expect(published.activationStartsAt).toEqual(new Date('2026-05-01T00:00:00.000Z'));
    expect(published.activationEndsAt).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(published.status).toBe('active');

    expect(mockInsertCalls).toHaveLength(1);
    expect(mockInsertCalls[0]?.table).toBe(rankingRulesets);
    expect(mockInsertCalls[0]?.values).toMatchObject({
      versionTag: 'v1.2.0',
      activationStartsAt: new Date('2026-05-01T00:00:00.000Z'),
      activationEndsAt: new Date('2026-07-01T00:00:00.000Z'),
      publishedByUserId: 'user-1',
    });
  });

  it('resolves exact ruleset version for historical replay timestamp', async () => {
    mockRankingRulesetsFindMany.mockResolvedValueOnce([
      makeRulesetRow({
        id: 'ruleset-3',
        versionTag: 'v1.3.0',
        activationStartsAt: new Date('2026-08-01T00:00:00.000Z'),
        activationEndsAt: null,
      }),
    ]);

    const resolved = await resolveRankingRulesetForTimestamp(
      new Date('2026-08-11T12:00:00.000Z'),
    );

    expect(resolved?.id).toBe('ruleset-3');
    expect(resolved?.versionTag).toBe('v1.3.0');
  });
});
