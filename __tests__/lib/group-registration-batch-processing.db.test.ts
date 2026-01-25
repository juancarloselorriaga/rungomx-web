jest.mock('next/cache', () => ({
  cacheTag: jest.fn(),
  cacheLife: jest.fn(),
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
}));

jest.mock('@/lib/audit', () => ({
  createAuditLog: jest.fn(async () => ({ ok: true })),
  getRequestContext: jest.fn(async () => ({})),
}));

jest.mock('@/lib/auth/guards', () => ({
  requireAuthenticatedUser: jest.fn(),
  requireAdminUser: jest.fn(),
  requireProfileCompleteUser: jest.fn(),
  requireStaffUser: jest.fn(),
}));

jest.mock('@/lib/features/flags', () => ({
  isEventsNoPaymentMode: jest.fn(() => false),
}));

jest.mock('@/lib/organizations/permissions', () => ({
  canUserAccessEvent: jest.fn(async () => ({})),
  requireOrgPermission: jest.fn(),
}));

import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { processGroupBatch } from '@/lib/events/group-registrations/actions';
import { requireAuthenticatedUser } from '@/lib/auth/guards';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

async function cleanupGroupRegistrationData(db: ReturnType<typeof getTestDb>) {
  await db.delete(schema.auditLogs);
  await db.delete(schema.groupRegistrationBatchRows);
  await db.delete(schema.groupRegistrationBatches);
  await db.delete(schema.groupDiscountRules);
  await db.delete(schema.registrants);
  await db.delete(schema.registrations);
  await db.delete(schema.pricingTiers);
  await db.delete(schema.eventDistances);
  await db.delete(schema.eventEditions);
  await db.delete(schema.eventSeries);
  await db.delete(schema.organizations);
}

describe('processGroupBatch - Database Integration', () => {
  const db = getTestDb();
  const mockRequireAuthenticatedUser = requireAuthenticatedUser as unknown as jest.Mock;

  beforeEach(async () => {
    await cleanupGroupRegistrationData(db);
    await cleanDatabase(db);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await cleanupGroupRegistrationData(db);
    await cleanDatabase(db);
  });

  it('creates registrations and marks batch processed', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: `Test Org ${suffix}`,
        slug: `test-org-${suffix}`,
      })
      .returning({ id: schema.organizations.id });

    const [actor] = await db
      .insert(schema.users)
      .values({
        name: `Uploader ${suffix}`,
        email: `uploader-${suffix}@example.com`,
        emailVerified: true,
      })
      .returning({ id: schema.users.id });

    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: actor.id },
      permissions: { canManageEvents: true, canViewOrganizersDashboard: true },
    });

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
        publicCode: `T${Math.random().toString(36).slice(2, 10)}`,
        slug: `edition-${suffix}`,
        visibility: 'draft',
      })
      .returning({ id: schema.eventEditions.id });

    const [distance] = await db
      .insert(schema.eventDistances)
      .values({
        editionId: edition.id,
        label: '10K',
        capacity: 100,
        capacityScope: 'per_distance',
        sortOrder: 0,
      })
      .returning({ id: schema.eventDistances.id });

    await db.insert(schema.pricingTiers).values({
      distanceId: distance.id,
      label: 'Base',
      priceCents: 10_000,
      currency: 'MXN',
      sortOrder: 0,
    });

    const [addOn] = await db
      .insert(schema.addOns)
      .values({
        editionId: edition.id,
        distanceId: distance.id,
        title: 'Medal engraving',
        type: 'merch',
        deliveryMethod: 'pickup',
        isActive: true,
        sortOrder: 0,
      })
      .returning({ id: schema.addOns.id });

    const [option] = await db
      .insert(schema.addOnOptions)
      .values({
        addOnId: addOn.id,
        label: 'Standard',
        priceCents: 2500,
        maxQtyPerOrder: 5,
        isActive: true,
        sortOrder: 0,
      })
      .returning({ id: schema.addOnOptions.id });

    await db.insert(schema.groupDiscountRules).values({
      editionId: edition.id,
      minParticipants: 2,
      percentOff: 10,
      isActive: true,
    });

    const [batch] = await db
      .insert(schema.groupRegistrationBatches)
      .values({
        editionId: edition.id,
        createdByUserId: actor.id,
        status: 'validated',
      })
      .returning({ id: schema.groupRegistrationBatches.id });

    await db.insert(schema.groupRegistrationBatchRows).values([
      {
        batchId: batch.id,
        rowIndex: 2,
        rawJson: {
          firstName: 'Ana',
          lastName: 'Perez',
          email: `ana-${suffix}@example.com`,
          dateOfBirth: '1990-01-01',
          distanceId: distance.id,
          addOnSelections: [{ optionId: option.id, quantity: 2 }],
        },
        validationErrorsJson: [],
      },
      {
        batchId: batch.id,
        rowIndex: 3,
        rawJson: {
          firstName: 'Luis',
          lastName: 'Gomez',
          email: `luis-${suffix}@example.com`,
          dateOfBirth: '1992-02-02',
          distanceId: distance.id,
          addOnSelections: [{ optionId: option.id, quantity: 2 }],
        },
        validationErrorsJson: [],
      },
    ]);

    const result = await processGroupBatch({ batchId: batch.id });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('processed');
    expect(result.data.createdCount).toBe(2);
    expect(result.data.groupDiscountPercentOff).toBe(10);

    const registrations = await db
      .select({
        id: schema.registrations.id,
        status: schema.registrations.status,
        basePriceCents: schema.registrations.basePriceCents,
        feesCents: schema.registrations.feesCents,
        totalCents: schema.registrations.totalCents,
      })
      .from(schema.registrations)
      .where(eq(schema.registrations.editionId, edition.id));

    expect(registrations).toHaveLength(2);
    registrations.forEach((registration) => {
      expect(registration.status).toBe('payment_pending');
      expect(registration.basePriceCents).toBe(9000);
      expect(registration.feesCents).toBe(500);
      expect(registration.totalCents).toBe(14500);
    });

    const selections = await db
      .select({
        registrationId: schema.addOnSelections.registrationId,
        optionId: schema.addOnSelections.optionId,
        quantity: schema.addOnSelections.quantity,
        lineTotalCents: schema.addOnSelections.lineTotalCents,
      })
      .from(schema.addOnSelections)
      .where(eq(schema.addOnSelections.optionId, option.id));

    expect(selections).toHaveLength(2);
    selections.forEach((selection) => {
      expect(selection.quantity).toBe(2);
      expect(selection.lineTotalCents).toBe(5000);
    });

    const processedBatch = await db.query.groupRegistrationBatches.findFirst({
      where: eq(schema.groupRegistrationBatches.id, batch.id),
      columns: { status: true, processedAt: true },
    });

    expect(processedBatch?.status).toBe('processed');
    expect(processedBatch?.processedAt).not.toBeNull();

    const linkedRows = await db
      .select({
        createdRegistrationId: schema.groupRegistrationBatchRows.createdRegistrationId,
      })
      .from(schema.groupRegistrationBatchRows)
      .where(eq(schema.groupRegistrationBatchRows.batchId, batch.id));

    expect(linkedRows).toHaveLength(2);
    expect(linkedRows.every((r) => r.createdRegistrationId)).toBe(true);

    const registrants = await db
      .select({ id: schema.registrants.id })
      .from(schema.registrants)
      .innerJoin(schema.registrations, eq(schema.registrants.registrationId, schema.registrations.id))
      .where(eq(schema.registrations.editionId, edition.id));

    expect(registrants).toHaveLength(2);
  });

  it('fails atomically when capacity is insufficient', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: `Test Org ${suffix}`,
        slug: `test-org-${suffix}`,
      })
      .returning({ id: schema.organizations.id });

    const [actor] = await db
      .insert(schema.users)
      .values({
        name: `Uploader ${suffix}`,
        email: `uploader-${suffix}@example.com`,
        emailVerified: true,
      })
      .returning({ id: schema.users.id });

    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: actor.id },
      permissions: { canManageEvents: true, canViewOrganizersDashboard: true },
    });

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
        publicCode: `T${Math.random().toString(36).slice(2, 10)}`,
        slug: `edition-${suffix}`,
        visibility: 'draft',
      })
      .returning({ id: schema.eventEditions.id });

    const [distance] = await db
      .insert(schema.eventDistances)
      .values({
        editionId: edition.id,
        label: '10K',
        capacity: 1,
        capacityScope: 'per_distance',
        sortOrder: 0,
      })
      .returning({ id: schema.eventDistances.id });

    await db.insert(schema.pricingTiers).values({
      distanceId: distance.id,
      label: 'Base',
      priceCents: 10_000,
      currency: 'MXN',
      sortOrder: 0,
    });

    const [batch] = await db
      .insert(schema.groupRegistrationBatches)
      .values({
        editionId: edition.id,
        createdByUserId: actor.id,
        status: 'validated',
      })
      .returning({ id: schema.groupRegistrationBatches.id });

    await db.insert(schema.groupRegistrationBatchRows).values([
      {
        batchId: batch.id,
        rowIndex: 2,
        rawJson: {
          firstName: 'Ana',
          lastName: 'Perez',
          email: `ana-${suffix}@example.com`,
          dateOfBirth: '1990-01-01',
          distanceId: distance.id,
        },
        validationErrorsJson: [],
      },
      {
        batchId: batch.id,
        rowIndex: 3,
        rawJson: {
          firstName: 'Luis',
          lastName: 'Gomez',
          email: `luis-${suffix}@example.com`,
          dateOfBirth: '1992-02-02',
          distanceId: distance.id,
        },
        validationErrorsJson: [],
      },
    ]);

    const result = await processGroupBatch({ batchId: batch.id });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INSUFFICIENT_CAPACITY');

    const registrations = await db
      .select({ id: schema.registrations.id })
      .from(schema.registrations)
      .where(eq(schema.registrations.editionId, edition.id));

    expect(registrations).toHaveLength(0);

    const unchangedBatch = await db.query.groupRegistrationBatches.findFirst({
      where: eq(schema.groupRegistrationBatches.id, batch.id),
      columns: { status: true, processedAt: true },
    });

    expect(unchangedBatch?.status).toBe('failed');
    expect(unchangedBatch?.processedAt).not.toBeNull();

    const linkedRows = await db
      .select({
        createdRegistrationId: schema.groupRegistrationBatchRows.createdRegistrationId,
      })
      .from(schema.groupRegistrationBatchRows)
      .where(eq(schema.groupRegistrationBatchRows.batchId, batch.id));

    expect(linkedRows).toHaveLength(2);
    expect(linkedRows.every((r) => r.createdRegistrationId === null)).toBe(true);
  });
});
