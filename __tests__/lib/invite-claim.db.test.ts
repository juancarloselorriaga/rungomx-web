import type { AuthContext } from '@/lib/auth/server';

type AuthContextStub = Omit<Partial<AuthContext>, 'user' | 'profile' | 'permissions'> & {
  user?: Partial<NonNullable<AuthContext['user']>> | null;
  profile?: Partial<NonNullable<AuthContext['profile']>> | null;
  permissions?: Partial<AuthContext['permissions']>;
};

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
}));

jest.mock('@/lib/audit', () => ({
  createAuditLog: jest.fn(async () => ({ ok: true })),
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({
    allowed: true,
    remaining: 1,
    resetAt: new Date(),
  })),
}));

let mockAuthContext: AuthContextStub | null = null;

jest.mock('@/lib/auth/action-wrapper', () => ({
  withAuthenticatedUser: (options: { unauthenticated: () => unknown }) => {
    return (handler: (ctx: AuthContext, input: unknown) => Promise<unknown>) => {
      return async (input: unknown) => {
        if (!mockAuthContext) {
          return options.unauthenticated();
        }
        return handler(mockAuthContext as AuthContext, input);
      };
    };
  },
}));

import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { claimInvite } from '@/lib/events/invite-claim/actions';
import { hashToken } from '@/lib/events/group-upload/tokens';
import { checkRateLimit } from '@/lib/rate-limit';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';
import { createTestUser } from '@/tests/helpers/fixtures';

const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

async function cleanupInvites(db: ReturnType<typeof getTestDb>) {
  await db.delete(schema.registrationInvites);
  await db.delete(schema.groupRegistrationBatchRows);
  await db.delete(schema.groupRegistrationBatches);
  await db.delete(schema.groupUploadLinks);
  await db.delete(schema.registrants);
  await db.delete(schema.registrations);
  await db.delete(schema.profiles);
  await db.delete(schema.eventDistances);
  await db.delete(schema.eventEditions);
  await db.delete(schema.eventSeries);
  await db.delete(schema.organizations);
  await db.delete(schema.users);
  await db.delete(schema.auditLogs);
}

async function seedInvite(db: ReturnType<typeof getTestDb>, params: { email: string; dateOfBirth: string }) {
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
    .values({
      editionId: edition.id,
      label: '10K',
      capacity: 100,
    })
    .returning({ id: schema.eventDistances.id });

  const [creator] = await db
    .insert(schema.users)
    .values({
      email: `creator-${suffix}@example.com`,
      name: 'Coordinator',
      emailVerified: true,
    })
    .returning({ id: schema.users.id });

  const [uploadLink] = await db
    .insert(schema.groupUploadLinks)
    .values({
      editionId: edition.id,
      tokenHash: `hash-${suffix}`,
      tokenPrefix: 'prefix',
      paymentResponsibility: 'self_pay',
      createdByUserId: creator.id,
    })
    .returning({ id: schema.groupUploadLinks.id });

  const [batch] = await db
    .insert(schema.groupRegistrationBatches)
    .values({
      editionId: edition.id,
      uploadLinkId: uploadLink.id,
      paymentResponsibility: 'self_pay',
      distanceId: distance.id,
      createdByUserId: creator.id,
      status: 'validated',
    })
    .returning({ id: schema.groupRegistrationBatches.id });

  const [row] = await db
    .insert(schema.groupRegistrationBatchRows)
    .values({
      batchId: batch.id,
      rowIndex: 1,
      rawJson: { email: params.email, emailNormalized: params.email.toLowerCase(), dateOfBirth: params.dateOfBirth },
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
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      paymentResponsibility: 'self_pay',
    })
    .returning({ id: schema.registrations.id });

  const inviteToken = `invite-${suffix}`;
  const tokenHash = hashToken(inviteToken);

  await db.insert(schema.registrationInvites).values({
    editionId: edition.id,
    uploadLinkId: uploadLink.id,
    batchId: batch.id,
    batchRowId: row.id,
    registrationId: registration.id,
    createdByUserId: creator.id,
    email: params.email,
    emailNormalized: params.email.toLowerCase(),
    dateOfBirth: new Date(`${params.dateOfBirth}T00:00:00.000Z`),
    inviteLocale: 'en',
    tokenHash,
    tokenPrefix: 'invite',
    status: 'sent',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  return { inviteToken, registrationId: registration.id, editionId: edition.id };
}

describe('claimInvite action - Database Integration', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanupInvites(db);
    await cleanDatabase(db);
    mockAuthContext = null;
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 1,
      resetAt: new Date(),
    });
  });

  afterAll(async () => {
    await cleanupInvites(db);
    await cleanDatabase(db);
  });

  it('allows claiming and is idempotent for the same user', async () => {
    const user = await createTestUser(db, { email: `athlete-${Date.now()}@example.com` });
    await db.insert(schema.profiles).values({ userId: user.id, dateOfBirth: new Date('1990-01-01T00:00:00.000Z') });

    const invite = await seedInvite(db, { email: user.email, dateOfBirth: '1990-01-01' });

    mockAuthContext = {
      user: { id: user.id, email: user.email, emailVerified: true },
      profile: { dateOfBirth: new Date('1990-01-01T00:00:00.000Z') },
      permissions: {},
    };

    const first = await claimInvite({ inviteToken: invite.inviteToken });
    expect(first).toEqual({ ok: true, data: { registrationId: invite.registrationId } });

    const second = await claimInvite({ inviteToken: invite.inviteToken });
    expect(second).toEqual({ ok: true, data: { registrationId: invite.registrationId } });

    const inviteRow = await db.query.registrationInvites.findFirst({
      where: eq(schema.registrationInvites.registrationId, invite.registrationId),
    });
    expect(inviteRow?.status).toBe('claimed');
  });

  it('rejects claims from a different user after claimed', async () => {
    const user = await createTestUser(db, { email: `athlete-${Date.now()}@example.com` });
    await db.insert(schema.profiles).values({ userId: user.id, dateOfBirth: new Date('1990-01-01T00:00:00.000Z') });

    const invite = await seedInvite(db, { email: user.email, dateOfBirth: '1990-01-01' });

    mockAuthContext = {
      user: { id: user.id, email: user.email, emailVerified: true },
      profile: { dateOfBirth: new Date('1990-01-01T00:00:00.000Z') },
      permissions: {},
    };

    await claimInvite({ inviteToken: invite.inviteToken });

    const otherUser = await createTestUser(db, { email: `other-${Date.now()}@example.com` });
    await db.insert(schema.profiles).values({ userId: otherUser.id, dateOfBirth: new Date('1990-01-01T00:00:00.000Z') });

    mockAuthContext = {
      user: { id: otherUser.id, email: otherUser.email, emailVerified: true },
      profile: { dateOfBirth: new Date('1990-01-01T00:00:00.000Z') },
      permissions: {},
    };

    const result = await claimInvite({ inviteToken: invite.inviteToken, dateOfBirth: '1990-01-01' });
    expect(result).toEqual({ ok: false, error: 'Invite already claimed', code: 'ALREADY_CLAIMED' });
  });

  it('blocks claim when user already registered in the edition', async () => {
    const user = await createTestUser(db, { email: `athlete-${Date.now()}@example.com` });
    await db.insert(schema.profiles).values({ userId: user.id, dateOfBirth: new Date('1990-01-01T00:00:00.000Z') });

    const invite = await seedInvite(db, { email: user.email, dateOfBirth: '1990-01-01' });

    await db.insert(schema.registrations).values({
      editionId: invite.editionId,
      distanceId: (await db.query.eventDistances.findFirst({ where: eq(schema.eventDistances.editionId, invite.editionId) }))!.id,
      buyerUserId: user.id,
      status: 'confirmed',
    });

    mockAuthContext = {
      user: { id: user.id, email: user.email, emailVerified: true },
      profile: { dateOfBirth: new Date('1990-01-01T00:00:00.000Z') },
      permissions: {},
    };

    const result = await claimInvite({ inviteToken: invite.inviteToken });
    expect(result).toEqual({ ok: false, error: 'Already registered', code: 'ALREADY_REGISTERED' });
  });
});
