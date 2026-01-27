process.env.EVENTS_INVITE_TOKEN_SECRET ??= 'test-secret-for-rotate-invite';

import type { AuthContext } from '@/lib/auth/server';

type AuthContextStub = Omit<Partial<AuthContext>, 'user' | 'profile' | 'permissions'> & {
  user?: Partial<NonNullable<AuthContext['user']>> | null;
  profile?: Partial<NonNullable<AuthContext['profile']>> | null;
  permissions?: Partial<AuthContext['permissions']>;
};

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
}));

jest.mock('@/i18n/navigation', () => ({
  getPathname: jest.fn(() => '/mock-path'),
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

jest.mock('@/lib/features/flags', () => ({
  isFeatureEnabled: jest.fn(() => true),
}));

jest.mock('@/lib/events/registration-invite-email', () => ({
  sendRegistrationInviteEmail: jest.fn(async () => undefined),
}));

import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { rotateInviteToken } from '@/lib/events/group-upload/actions';
import { hashToken } from '@/lib/events/group-upload/tokens';
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
}

describe('rotateInviteToken - Database Integration', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanupData(db);
    await cleanDatabase(db);
    mockAuthContext = null;
  });

  afterAll(async () => {
    await cleanupData(db);
    await cleanDatabase(db);
  });

  it('creates a new invite and supersedes the old token', async () => {
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

    const uploadToken = `upload-${suffix}`;
    const [uploadLink] = await db
      .insert(schema.groupUploadLinks)
      .values({
        editionId: edition.id,
        tokenHash: hashToken(uploadToken),
        tokenPrefix: uploadToken.slice(0, 6),
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
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        paymentResponsibility: 'self_pay',
      })
      .returning({ id: schema.registrations.id });

    const [invite] = await db
      .insert(schema.registrationInvites)
      .values({
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
      })
      .returning({ id: schema.registrationInvites.id });

    mockAuthContext = {
      user: { id: user.id, email: user.email },
      permissions: { canManageEvents: true },
    };

    const result = await rotateInviteToken({ uploadToken, inviteId: invite.id });
    expect(result).toEqual({ ok: true, data: undefined });

    const invites = await db.query.registrationInvites.findMany({
      where: eq(schema.registrationInvites.batchRowId, row.id),
    });

    const current = invites.find((row) => row.isCurrent);
    const superseded = invites.find((row) => row.id === invite.id);

    expect(invites.length).toBe(2);
    expect(current?.status).toBe('draft');
    expect(superseded?.status).toBe('superseded');
  });
});
