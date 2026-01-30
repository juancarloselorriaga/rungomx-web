import { test, expect } from '@playwright/test';
import { and, eq } from 'drizzle-orm';

import { cleanupExpiredRegistrations } from '@/lib/events/cleanup-expired-registrations';
import { generateToken, getTokenPrefix, hashToken, deriveInviteToken } from '@/lib/events/group-upload/tokens';
import { normalizeEmail } from '@/lib/events/shared/identity';
import {
  groupRegistrationBatchRows,
  groupRegistrationBatches,
  groupUploadLinks,
  registrants,
  registrationInvites,
  registrations,
} from '@/db/schema';

import { getTestDb } from '../utils/db';
import {
  assignExternalRole,
  createTestDistance,
  createTestEventEdition,
  createTestEventSeries,
  createTestOrganization,
  createTestPricingTier,
  createTestProfile,
  getUserByEmail,
  setUserVerified,
  signUpTestUser,
} from '../utils/fixtures';
import { signInAsAthlete, signInAsOrganizer } from '../utils/helpers';

type UploadLinkFixture = {
  id: string;
  token: string;
  tokenPrefix: string;
};

async function createUploadLink(params: {
  editionId: string;
  createdByUserId: string;
  maxInvites?: number | null;
  endsAt?: Date | null;
}): Promise<UploadLinkFixture> {
  const db = getTestDb();
  const token = generateToken();
  const tokenPrefix = getTokenPrefix(token);
  const tokenHash = hashToken(token);

  const [created] = await db
    .insert(groupUploadLinks)
    .values({
      editionId: params.editionId,
      tokenHash,
      tokenPrefix,
      createdByUserId: params.createdByUserId,
      maxInvites: params.maxInvites ?? null,
      endsAt: params.endsAt ?? null,
    })
    .returning({ id: groupUploadLinks.id });

  return { id: created.id, token, tokenPrefix };
}

async function seedBatchRows(params: {
  batchId: string;
  rows: Array<{
    firstName: string;
    lastName: string;
    email: string;
    dateOfBirth: string;
    genderIdentity?: string | null;
  }>;
}) {
  const db = getTestDb();

  await db
    .update(groupRegistrationBatches)
    .set({ status: 'validated' })
    .where(eq(groupRegistrationBatches.id, params.batchId));

  const inserts = params.rows.map((row, index) => {
    const emailNormalized = normalizeEmail(row.email);
    return {
      batchId: params.batchId,
      rowIndex: index + 2,
      rawJson: {
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        emailNormalized,
        dateOfBirth: row.dateOfBirth,
        genderIdentity: row.genderIdentity ?? null,
      },
      validationErrorsJson: [],
    };
  });

  const created = await db
    .insert(groupRegistrationBatchRows)
    .values(inserts)
    .returning({ id: groupRegistrationBatchRows.id });

  return created.map((r) => r.id);
}

test.describe('Group Upload (Phase 3) - Smoke', () => {
  test.describe.configure({ mode: 'serial' });

  const db = getTestDb();

  let organizerCreds: { email: string; password: string; name: string };
  let coordinatorCreds: { email: string; password: string; name: string };
  let athleteCreds: { email: string; password: string; name: string };

  let organizerId: string;
  let coordinatorId: string;
  let athleteId: string;

  let seriesSlug: string;
  let editionSlug: string;
  let editionId: string;
  let distanceLabel: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    organizerCreds = await signUpTestUser(page, 'org-group-upload-', {
      name: 'Group Upload Test Organizer',
      password: 'TestE2E!GroupUploadPass',
    });
    coordinatorCreds = await signUpTestUser(page, 'athlete-group-upload-coord-', {
      name: 'Group Upload Test Athlete Coordinator',
      password: 'TestE2E!GroupUploadPass',
    });
    athleteCreds = await signUpTestUser(page, 'athlete-group-upload-claim-', {
      name: 'Group Upload Test Athlete Claimant',
      password: 'TestE2E!GroupUploadPass',
    });

    await setUserVerified(db, organizerCreds.email);
    await setUserVerified(db, coordinatorCreds.email);
    await setUserVerified(db, athleteCreds.email);

    const organizer = await getUserByEmail(db, organizerCreds.email);
    const coordinator = await getUserByEmail(db, coordinatorCreds.email);
    const athlete = await getUserByEmail(db, athleteCreds.email);

    organizerId = organizer!.id;
    coordinatorId = coordinator!.id;
    athleteId = athlete!.id;

    await createTestProfile(db, organizerId, {
      dateOfBirth: new Date('1990-05-15'),
      gender: 'male',
      shirtSize: 'm',
      bloodType: 'o+',
      phone: '+523312345678',
      city: 'Mexico City',
      state: 'CDMX',
      emergencyContactName: 'Test Contact',
      emergencyContactPhone: '+523387654321',
    });

    await createTestProfile(db, coordinatorId, {
      dateOfBirth: new Date('1992-01-20'),
      gender: 'female',
      shirtSize: 'm',
      bloodType: 'o+',
      phone: '+523312345679',
      city: 'Guadalajara',
      state: 'JAL',
      emergencyContactName: 'Test Contact',
      emergencyContactPhone: '+523387654322',
    });

    await createTestProfile(db, athleteId, {
      dateOfBirth: new Date('1990-01-15'),
      gender: 'female',
      shirtSize: 'm',
      bloodType: 'o+',
      phone: '+523312345680',
      city: 'Monterrey',
      state: 'NL',
      emergencyContactName: 'Test Contact',
      emergencyContactPhone: '+523387654323',
    });

    await assignExternalRole(db, organizerId, 'organizer');
    await assignExternalRole(db, coordinatorId, 'athlete');
    await assignExternalRole(db, athleteId, 'athlete');

    const org = await createTestOrganization(db, organizerId, {
      name: `Group Upload Org ${Date.now()}`,
      slug: `group-upload-org-${Date.now()}`,
    });
    const series = await createTestEventSeries(db, org.id, {
      name: `Group Upload Event ${Date.now()}`,
      slug: `group-upload-${Date.now()}`,
    });
    const edition = await createTestEventEdition(db, series.id, {
      slug: `edition-${Date.now()}`,
      visibility: 'published',
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      timezone: 'America/Mexico_City',
      city: 'Monterrey',
      state: 'Nuevo León',
      locationDisplay: 'Monterrey, NL',
    });
    const distance = await createTestDistance(db, edition.id, { label: '10K' });
    await createTestPricingTier(db, distance.id, {
      priceCents: 50000,
      startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      sortOrder: 0,
    });

    seriesSlug = series.slug;
    editionSlug = edition.slug;
    editionId = edition.id;
    distanceLabel = distance.label;

    await context.close();
  });

  test('Counts active invites only (rotation does not consume maxInvites)', async ({ page }) => {
    const link = await createUploadLink({
      editionId,
      createdByUserId: organizerId,
      maxInvites: 2,
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await signInAsAthlete(page, coordinatorCreds);

    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/group-upload/${link.token}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: distanceLabel }).click();
    await page.getByRole('button', { name: /create batch/i }).click();
    await page.waitForURL(/\/group-upload\/[^/]+\/batches\/[^/]+/, { timeout: 20000 });

    const batchUrl = page.url();
    const match = batchUrl.match(/\/batches\/([a-f0-9-]{36})/i);
    expect(match?.[1]).toBeTruthy();
    const batchId = match![1]!;

    const [batchRowId] = await seedBatchRows({
      batchId,
      rows: [
        {
          firstName: 'Ana',
          lastName: 'Perez',
          email: `participant-${Date.now()}@test.example.com`,
          dateOfBirth: '1990-01-15',
          genderIdentity: 'non-binary',
        },
      ],
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /reserve invites/i }).click();
    await expect(page.getByText(/invites reserved/i)).toBeVisible({ timeout: 15000 });

    // Verify genderIdentity persisted to registrants (no silent drop).
    const row = await db.query.groupRegistrationBatchRows.findFirst({
      where: eq(groupRegistrationBatchRows.id, batchRowId),
      columns: { createdRegistrationId: true },
    });
    expect(row?.createdRegistrationId).toBeTruthy();

    const registrant = await db.query.registrants.findFirst({
      where: eq(registrants.registrationId, row!.createdRegistrationId!),
      columns: { genderIdentity: true },
    });
    expect(registrant?.genderIdentity).toBe('non-binary');

    // Rotate invite token -> should not bump inviteCount and max out the link.
    await page.getByRole('button', { name: /rotate link/i }).click();
    await expect(page.getByText(/invite link rotated/i)).toBeVisible({ timeout: 15000 });

    await signInAsOrganizer(page, organizerCreds);
    await page.goto(`/en/dashboard/events/${editionId}/group-registrations`);
    await page.waitForLoadState('networkidle');

    const linkRow = page.getByText(`${link.tokenPrefix}…`).locator('xpath=ancestor::tr[1]');
    await expect(linkRow).toContainText(/active/i);
    await expect(linkRow).toContainText(/1 invites/i);
  });

  test('Allows reserving after link expiry for existing batches', async ({ page }) => {
    const link = await createUploadLink({
      editionId,
      createdByUserId: organizerId,
      maxInvites: 5,
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await signInAsAthlete(page, coordinatorCreds);
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/group-upload/${link.token}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: distanceLabel }).click();
    await page.getByRole('button', { name: /create batch/i }).click();
    await page.waitForURL(/\/group-upload\/[^/]+\/batches\/[^/]+/, { timeout: 20000 });

    const match = page.url().match(/\/batches\/([a-f0-9-]{36})/i);
    expect(match?.[1]).toBeTruthy();
    const batchId = match![1]!;

    await seedBatchRows({
      batchId,
      rows: [
        {
          firstName: 'Carlos',
          lastName: 'Lopez',
          email: `expired-link-${Date.now()}@test.example.com`,
          dateOfBirth: '1990-01-15',
        },
      ],
    });

    // Force link to expired AFTER the batch was created.
    await db
      .update(groupUploadLinks)
      .set({ endsAt: new Date(Date.now() - 60 * 1000) })
      .where(eq(groupUploadLinks.id, link.id));

    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /reserve invites/i }).click();
    await expect(page.getByText(/invites reserved/i)).toBeVisible({ timeout: 15000 });
  });

  test('Reissues invites for expired rows (no need to wait for cron)', async ({ page }) => {
    const link = await createUploadLink({
      editionId,
      createdByUserId: organizerId,
      maxInvites: 5,
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await signInAsAthlete(page, coordinatorCreds);
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/group-upload/${link.token}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: distanceLabel }).click();
    await page.getByRole('button', { name: /create batch/i }).click();
    await page.waitForURL(/\/group-upload\/[^/]+\/batches\/[^/]+/, { timeout: 20000 });

    const match = page.url().match(/\/batches\/([a-f0-9-]{36})/i);
    expect(match?.[1]).toBeTruthy();
    const batchId = match![1]!;

    const [batchRowId] = await seedBatchRows({
      batchId,
      rows: [
        {
          firstName: 'Bea',
          lastName: 'Diaz',
          email: `reissue-${Date.now()}@test.example.com`,
          dateOfBirth: '1990-01-15',
        },
      ],
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /reserve invites/i }).click();
    await expect(page.getByText(/invites reserved/i)).toBeVisible({ timeout: 15000 });

    const row = await db.query.groupRegistrationBatchRows.findFirst({
      where: eq(groupRegistrationBatchRows.id, batchRowId),
      columns: { createdRegistrationId: true },
    });
    expect(row?.createdRegistrationId).toBeTruthy();

    // Expire the underlying registration and run cleanup to drop the current invite.
    await db
      .update(registrations)
      .set({ expiresAt: new Date(Date.now() - 60 * 1000) })
      .where(eq(registrations.id, row!.createdRegistrationId!));
    await cleanupExpiredRegistrations();

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/expired/i)).toBeVisible();
    await page.getByRole('button', { name: /reissue/i }).click();
    await expect(page.getByText(/invite reissued/i)).toBeVisible({ timeout: 15000 });
  });

  test('Extends hold for claimed invites', async ({ page }) => {
    const link = await createUploadLink({
      editionId,
      createdByUserId: organizerId,
      maxInvites: 5,
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // Coordinator creates the batch and reserves an invite for the athlete email.
    await signInAsAthlete(page, coordinatorCreds);
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/group-upload/${link.token}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: distanceLabel }).click();
    await page.getByRole('button', { name: /create batch/i }).click();
    await page.waitForURL(/\/group-upload\/[^/]+\/batches\/[^/]+/, { timeout: 20000 });

    const batchMatch = page.url().match(/\/batches\/([a-f0-9-]{36})/i);
    expect(batchMatch?.[1]).toBeTruthy();
    const batchId = batchMatch![1]!;

    const [batchRowId] = await seedBatchRows({
      batchId,
      rows: [
        {
          firstName: 'Luz',
          lastName: 'Claim',
          email: athleteCreds.email,
          dateOfBirth: '1990-01-15',
        },
      ],
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /reserve invites/i }).click();
    await expect(page.getByText(/invites reserved/i)).toBeVisible({ timeout: 15000 });

    const invite = await db.query.registrationInvites.findFirst({
      where: and(eq(registrationInvites.batchRowId, batchRowId), eq(registrationInvites.isCurrent, true)),
      columns: { id: true, registrationId: true },
    });
    expect(invite?.id).toBeTruthy();
    expect(invite?.registrationId).toBeTruthy();

    const claimToken = deriveInviteToken(invite!.id);

    // Athlete claims the invite.
    await signInAsAthlete(page, athleteCreds);
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/claim/${claimToken}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /claim and continue/i }).click();
    await page.waitForURL(/\/register\/complete\/[a-f0-9-]{36}/i, { timeout: 20000 });

    // Force the registration to be near-expiry, then extend from the batch UI.
    const nearExpiry = new Date(Date.now() + 60 * 1000);
    await db
      .update(registrations)
      .set({ expiresAt: nearExpiry })
      .where(eq(registrations.id, invite!.registrationId));

    await signInAsAthlete(page, coordinatorCreds);
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/group-upload/${link.token}/batches/${batchId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/claimed/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /extend hold/i }).click();
    await expect(page.getByText(/hold extended/i)).toBeVisible({ timeout: 15000 });

    const updated = await db.query.registrations.findFirst({
      where: eq(registrations.id, invite!.registrationId),
      columns: { expiresAt: true },
    });
    expect(updated?.expiresAt).toBeTruthy();
    expect(updated!.expiresAt!.getTime()).toBeGreaterThan(nearExpiry.getTime() + 60 * 60 * 1000);
  });
});
