import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';

import {
  eventDistances,
  eventEditions,
  eventSeries,
  organizations,
  refundRequests,
  registrations,
  users,
} from '@/db/schema';
import { submitAdminRefundDecision } from '@/lib/payments/refunds/decision-submission';
import { escalateExpiredRefundRequests } from '@/lib/payments/refunds/escalation-and-goodwill';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

describe('escalation to admin decision integration (database)', () => {
  const testDb = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
  });

  it('escalates an expired pending refund request and persists an admin approval decision', async () => {
    const suffix = randomUUID();

    const [organization] = await testDb
      .insert(organizations)
      .values({
        name: `Admin Decision Test Org ${suffix}`,
        slug: `admin-decision-test-${suffix}`,
      })
      .returning({ id: organizations.id });

    const [attendeeUser] = await testDb
      .insert(users)
      .values({
        name: `Admin Decision Attendee ${suffix}`,
        email: `admin-decision-attendee-${suffix}@example.com`,
        emailVerified: true,
      })
      .returning({ id: users.id });

    const [staffActorUser] = await testDb
      .insert(users)
      .values({
        name: `Admin Decision Staff Actor ${suffix}`,
        email: `admin-decision-staff-${suffix}@example.com`,
        emailVerified: true,
      })
      .returning({ id: users.id });

    const [series] = await testDb
      .insert(eventSeries)
      .values({
        organizationId: organization!.id,
        slug: `admin-decision-series-${suffix}`,
        name: `Admin Decision Series ${suffix}`,
        sportType: 'trail_running',
      })
      .returning({ id: eventSeries.id });

    const [edition] = await testDb
      .insert(eventEditions)
      .values({
        seriesId: series!.id,
        editionLabel: '2026',
        publicCode: `AD${suffix.slice(0, 8)}`,
        slug: `admin-decision-edition-${suffix}`,
        visibility: 'published',
      })
      .returning({ id: eventEditions.id });

    const [distance] = await testDb
      .insert(eventDistances)
      .values({
        editionId: edition!.id,
        label: '10K',
        capacity: 100,
      })
      .returning({ id: eventDistances.id });

    const [registration] = await testDb
      .insert(registrations)
      .values({
        editionId: edition!.id,
        distanceId: distance!.id,
        buyerUserId: attendeeUser!.id,
        status: 'confirmed',
        basePriceCents: 50000,
        feesCents: 5000,
        taxCents: 0,
        totalCents: 55000,
      })
      .returning({ id: registrations.id });

    const requestedAt = new Date('2026-03-01T09:00:00.000Z');
    const now = new Date('2026-03-05T12:00:00.000Z');

    // Insert the refund_requests row directly rather than going through
    // request-submission.ts: that module enforces the full registration /
    // edition refund-eligibility policy, which is unrelated to what this
    // test proves (the escalation SLA transition -> admin CAS decision
    // integration against real Postgres). Seeding the row directly isolates
    // the state-machine transition under test. Deliberately not a goodwill
    // request (reasonCode/eligibilitySnapshotJson do not carry goodwill
    // markers) so this exercises the organizer-escalation path, and
    // execution itself is intentionally out of scope (already covered by
    // refund-execution.server.test.ts).
    const [refundRequest] = await testDb
      .insert(refundRequests)
      .values({
        registrationId: registration!.id,
        editionId: edition!.id,
        organizerId: organization!.id,
        attendeeUserId: attendeeUser!.id,
        requestedByUserId: attendeeUser!.id,
        status: 'pending_organizer_decision',
        reasonCode: 'medical',
        reasonNote: 'Attendee requested refund for medical reasons.',
        eligibilitySnapshotJson: {},
        financialSnapshotJson: {},
        requestedAt,
      })
      .returning({ id: refundRequests.id });

    const escalationResult = await escalateExpiredRefundRequests({
      organizerId: organization!.id,
      actorUserId: staffActorUser!.id,
      requestedBefore: now,
      now,
    });

    expect(escalationResult.escalatedCount).toBe(1);
    expect(escalationResult.refundRequestIds).toEqual([refundRequest!.id]);

    const decision = await submitAdminRefundDecision({
      refundRequestId: refundRequest!.id,
      organizerId: organization!.id,
      decidedByUserId: staffActorUser!.id,
      decision: 'approve',
      decisionReason: 'Approved after admin review of escalated request.',
      now,
    });

    expect(decision.status).toBe('approved');
    expect(decision.decidedByUserId).toBe(staffActorUser!.id);

    const [freshRow] = await testDb
      .select({
        status: refundRequests.status,
        decidedByUserId: refundRequests.decidedByUserId,
        decisionAt: refundRequests.decisionAt,
      })
      .from(refundRequests)
      .where(eq(refundRequests.id, refundRequest!.id));

    expect(freshRow?.status).toBe('approved');
    expect(freshRow?.decidedByUserId).toBe(staffActorUser!.id);
    expect(freshRow?.decisionAt).not.toBeNull();
  });
});
