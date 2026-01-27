import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { cleanupExpiredRegistrations } from '@/lib/events/cleanup-expired-registrations';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

async function cleanupData(db: ReturnType<typeof getTestDb>) {
  await db.delete(schema.registrationInvites);
  await db.delete(schema.groupRegistrationBatchRows);
  await db.delete(schema.groupRegistrationBatches);
  await db.delete(schema.groupUploadLinks);
  await db.delete(schema.registrants);
  await db.delete(schema.registrations);
  await db.delete(schema.eventDistances);
  await db.delete(schema.eventEditions);
  await db.delete(schema.eventSeries);
  await db.delete(schema.organizations);
  await db.delete(schema.users);
  await db.delete(schema.auditLogs);
}

describe('cleanupExpiredRegistrations - Database Integration', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanupData(db);
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanupData(db);
    await cleanDatabase(db);
  });

  it('marks linked invites as expired when cancelling expired registrations', async () => {
    const suffix = `${Date.now() % 1e8}-${Math.floor(Math.random() * 1000)}`;

    const [organization] = await db
      .insert(schema.organizations)
      .values({ name: `Org ${suffix}`, slug: `org-${suffix}` })
      .returning({ id: schema.organizations.id });

    const [series] = await db
      .insert(schema.eventSeries)
      .values({
        organizationId: organization.id,
        slug: `series-${suffix}`,
        name: `Series ${suffix}`,
        sportType: 'trail_running',
      })
      .returning({ id: schema.eventSeries.id });

    const [edition] = await db
      .insert(schema.eventEditions)
      .values({
        seriesId: series.id,
        editionLabel: '2026',
        publicCode: `P-${suffix}`,
        slug: `edition-${suffix}`,
        visibility: 'published',
      })
      .returning({ id: schema.eventEditions.id });

    const [distance] = await db
      .insert(schema.eventDistances)
      .values({ editionId: edition.id, label: '10K' })
      .returning({ id: schema.eventDistances.id });

    const [user] = await db
      .insert(schema.users)
      .values({ email: `user-${suffix}@example.com`, name: 'User', emailVerified: true })
      .returning({ id: schema.users.id, email: schema.users.email });

    const [uploadLink] = await db
      .insert(schema.groupUploadLinks)
      .values({
        editionId: edition.id,
        tokenHash: `hash-${suffix}`,
        tokenPrefix: 'prefix',
        paymentResponsibility: 'self_pay',
        createdByUserId: user.id,
      })
      .returning({ id: schema.groupUploadLinks.id });

    const [batch] = await db
      .insert(schema.groupRegistrationBatches)
      .values({
        editionId: edition.id,
        uploadLinkId: uploadLink.id,
        paymentResponsibility: 'self_pay',
        distanceId: distance.id,
        createdByUserId: user.id,
        status: 'validated',
      })
      .returning({ id: schema.groupRegistrationBatches.id });

    const [row] = await db
      .insert(schema.groupRegistrationBatchRows)
      .values({
        batchId: batch.id,
        rowIndex: 1,
        rawJson: { email: user.email, emailNormalized: user.email.toLowerCase(), dateOfBirth: '1990-01-01' },
        validationErrorsJson: [],
      })
      .returning({ id: schema.groupRegistrationBatchRows.id });

    const [registration] = await db
      .insert(schema.registrations)
      .values({
        editionId: edition.id,
        distanceId: distance.id,
        buyerUserId: null,
        status: 'started',
        expiresAt: new Date(Date.now() - 60 * 1000),
        paymentResponsibility: 'self_pay',
      })
      .returning({ id: schema.registrations.id });

    await db.insert(schema.registrationInvites).values({
      editionId: edition.id,
      uploadLinkId: uploadLink.id,
      batchId: batch.id,
      batchRowId: row.id,
      registrationId: registration.id,
      createdByUserId: user.id,
      email: user.email,
      emailNormalized: user.email.toLowerCase(),
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      inviteLocale: 'en',
      tokenHash: `invite-${suffix}`,
      tokenPrefix: 'invite',
      status: 'sent',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const cancelled = await cleanupExpiredRegistrations();
    expect(cancelled).toBe(1);

    const invite = await db.query.registrationInvites.findFirst({
      where: eq(schema.registrationInvites.registrationId, registration.id),
    });

    expect(invite?.status).toBe('expired');
    expect(invite?.isCurrent).toBe(false);
  });
});
