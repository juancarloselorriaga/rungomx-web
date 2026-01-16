/**
 * Database integration tests for participant registrations queries.
 */
import * as schema from '@/db/schema';
import { getMyRegistrationDetail, getMyRegistrations } from '@/lib/events/queries';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

async function cleanupEvents(db: ReturnType<typeof getTestDb>) {
  await db.delete(schema.waiverAcceptances);
  await db.delete(schema.registrants);
  await db.delete(schema.registrations);
  await db.delete(schema.waivers);
  await db.delete(schema.eventDistances);
  await db.delete(schema.eventEditions);
  await db.delete(schema.eventSeries);
  await db.delete(schema.organizations);
  await db.delete(schema.users);
}

describe('my registrations queries - Database Integration', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanupEvents(db);
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanupEvents(db);
    await cleanDatabase(db);
  });

  it('returns only registrations for the requesting user', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const publicCode = `PUB-${suffix.replace(/[^0-9]/g, '').slice(0, 15)}`;
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: `Test Org ${suffix}`,
        slug: `test-org-${suffix}`,
      })
      .returning({ id: schema.organizations.id });

    const [series] = await db
      .insert(schema.eventSeries)
      .values({
        organizationId: organization.id,
        slug: `series-${suffix}`,
        name: `Test Series ${suffix}`,
        sportType: 'trail_running',
      })
      .returning({ id: schema.eventSeries.id });

    const [edition] = await db
      .insert(schema.eventEditions)
      .values({
        seriesId: series.id,
        editionLabel: '2026',
        publicCode,
        slug: `edition-${suffix}`,
        visibility: 'published',
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning({ id: schema.eventEditions.id });

    const [distance] = await db
      .insert(schema.eventDistances)
      .values({
        editionId: edition.id,
        label: '10K',
      })
      .returning({ id: schema.eventDistances.id });

    const [userA] = await db
      .insert(schema.users)
      .values({
        name: `User A ${suffix}`,
        email: `user-a-${suffix}@example.com`,
      })
      .returning({ id: schema.users.id });

    const [userB] = await db
      .insert(schema.users)
      .values({
        name: `User B ${suffix}`,
        email: `user-b-${suffix}@example.com`,
      })
      .returning({ id: schema.users.id });

    const [registrationA] = await db
      .insert(schema.registrations)
      .values({
        editionId: edition.id,
        distanceId: distance.id,
        buyerUserId: userA.id,
        status: 'confirmed',
      })
      .returning({ id: schema.registrations.id });

    await db.insert(schema.registrations).values({
      editionId: edition.id,
      distanceId: distance.id,
      buyerUserId: userB.id,
      status: 'confirmed',
    });

    const results = await getMyRegistrations(userA.id, {
      view: 'upcoming',
      now: new Date(),
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(registrationA.id);
  });

  it('returns registration detail with registrant snapshot and waivers', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const publicCode = `PUB-${suffix.replace(/[^0-9]/g, '').slice(0, 15)}`;
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: `Test Org ${suffix}`,
        slug: `test-org-${suffix}`,
      })
      .returning({ id: schema.organizations.id });

    const [series] = await db
      .insert(schema.eventSeries)
      .values({
        organizationId: organization.id,
        slug: `series-${suffix}`,
        name: `Test Series ${suffix}`,
        sportType: 'trail_running',
      })
      .returning({ id: schema.eventSeries.id });

    const [edition] = await db
      .insert(schema.eventEditions)
      .values({
        seriesId: series.id,
        editionLabel: '2026',
        publicCode,
        slug: `edition-${suffix}`,
        visibility: 'published',
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning({ id: schema.eventEditions.id });

    const [distance] = await db
      .insert(schema.eventDistances)
      .values({
        editionId: edition.id,
        label: '21K',
      })
      .returning({ id: schema.eventDistances.id });

    const [user] = await db
      .insert(schema.users)
      .values({
        name: `User ${suffix}`,
        email: `user-${suffix}@example.com`,
      })
      .returning({ id: schema.users.id });

    const [otherUser] = await db
      .insert(schema.users)
      .values({
        name: `Other ${suffix}`,
        email: `other-${suffix}@example.com`,
      })
      .returning({ id: schema.users.id });

    const [registration] = await db
      .insert(schema.registrations)
      .values({
        editionId: edition.id,
        distanceId: distance.id,
        buyerUserId: user.id,
        status: 'confirmed',
      })
      .returning({ id: schema.registrations.id });

    await db.insert(schema.registrants).values({
      registrationId: registration.id,
      userId: user.id,
      profileSnapshot: {
        firstName: 'Ana',
        lastName: 'Gomez',
        email: `user-${suffix}@example.com`,
      },
    });

    const [waiver] = await db
      .insert(schema.waivers)
      .values({
        editionId: edition.id,
        title: `Waiver ${suffix}`,
        body: 'Test waiver body',
        versionHash: `hash-${suffix}`,
        signatureType: 'checkbox',
      })
      .returning({ id: schema.waivers.id });

    await db.insert(schema.waiverAcceptances).values({
      registrationId: registration.id,
      waiverId: waiver.id,
      waiverVersionHash: `hash-${suffix}`,
      acceptedAt: new Date(),
      signatureType: 'checkbox',
    });

    const detail = await getMyRegistrationDetail(user.id, registration.id);

    expect(detail).not.toBeNull();
    expect(detail?.registrant?.profileSnapshot?.firstName).toBe('Ana');
    expect(detail?.waiverAcceptances).toHaveLength(1);
    expect(detail?.waiverAcceptances[0]?.title).toBe(`Waiver ${suffix}`);

    const unauthorized = await getMyRegistrationDetail(otherUser.id, registration.id);
    expect(unauthorized).toBeNull();
  });
});
