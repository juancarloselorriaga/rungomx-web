import { buildOrganizerResultVersionVisibility } from '@/lib/events/results/workspace';

describe('buildOrganizerResultVersionVisibility', () => {
  it('orders versions by latest number and marks the active official version', () => {
    const visibility = buildOrganizerResultVersionVisibility([
      {
        id: 'version-2',
        versionNumber: 2,
        status: 'official',
        finalizedAt: new Date('2026-02-07T10:00:00.000Z'),
        finalizedByUserId: 'organizer-a',
        createdAt: new Date('2026-02-07T09:00:00.000Z'),
      },
      {
        id: 'version-3',
        versionNumber: 3,
        status: 'corrected',
        finalizedAt: new Date('2026-02-08T10:00:00.000Z'),
        finalizedByUserId: 'organizer-b',
        createdAt: new Date('2026-02-08T09:00:00.000Z'),
      },
      {
        id: 'version-4',
        versionNumber: 4,
        status: 'draft',
        finalizedAt: null,
        finalizedByUserId: null,
        createdAt: new Date('2026-02-09T09:00:00.000Z'),
      },
    ]);

    expect(visibility.activeOfficialVersionId).toBe('version-3');
    expect(visibility.items.map((item) => item.id)).toEqual([
      'version-4',
      'version-3',
      'version-2',
    ]);
    expect(visibility.items.find((item) => item.id === 'version-3')?.isActiveOfficial).toBe(true);
    expect(visibility.items.find((item) => item.id === 'version-2')?.isActiveOfficial).toBe(false);
  });

  it('returns null active marker when no official/corrected version exists', () => {
    const visibility = buildOrganizerResultVersionVisibility([
      {
        id: 'version-1',
        versionNumber: 1,
        status: 'draft',
        finalizedAt: null,
        finalizedByUserId: null,
        createdAt: new Date('2026-02-07T09:00:00.000Z'),
      },
    ]);

    expect(visibility.activeOfficialVersionId).toBeNull();
    expect(visibility.items[0]?.isActiveOfficial).toBe(false);
  });
});
