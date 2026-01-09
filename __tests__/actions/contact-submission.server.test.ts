jest.mock('next-intl/routing', () => ({
  defineRouting: jest.fn(() => ({
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed',
    pathnames: {},
  })),
}));

import { submitContactSubmission } from '@/app/actions/contact-submission';
import { auth } from '@/lib/auth';
import type { PermissionSet } from '@/lib/auth/roles';
import { EMPTY_PROFILE_STATUS } from '@/lib/auth/user-context';
import { createContactSubmission, notifySupportOfSubmission } from '@/lib/contact-submissions';
import type { ContactSubmissionRecord } from '@/lib/contact-submissions/types';
import { buildProfileMetadata } from '@/lib/profiles/metadata';
import { buildProfileRequirementSummary } from '@/lib/profiles/requirements';
import { checkRateLimit } from '@/lib/rate-limit';
import { extractLocaleFromRequest } from '@/lib/utils/locale';
import { headers } from 'next/headers';

jest.mock('@/lib/contact-submissions', () => {
  const { z } = require('zod') as typeof import('zod');

  const contactSubmissionSchema = z.object({
    name: z.string().trim().min(1).max(255).optional(),
    email: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim() : val),
      z.email().max(255).optional(),
    ),
    message: z.string().trim().min(1).max(5000),
    origin: z.string().trim().min(1).max(100).default('unknown'),
    userId: z.uuid().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    // Allow any honeypot string so the action's
    // explicit honeypot check can handle bot detection.
    honeypot: z.string().optional(),
  });

  return {
    contactSubmissionSchema,
    createContactSubmission: jest.fn(),
    notifySupportOfSubmission: jest.fn(),
  };
});

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

jest.mock('@/lib/utils/locale', () => ({
  extractLocaleFromRequest: jest.fn(() => 'es'),
}));

jest.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

type HeaderValues = Record<string, string | undefined>;
type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

const mockHeaders = headers as jest.MockedFunction<typeof headers>;
const mockLocale = extractLocaleFromRequest as jest.MockedFunction<typeof extractLocaleFromRequest>;
const mockGetSession = auth.api.getSession as jest.MockedFunction<typeof auth.api.getSession>;
const mockRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;
const mockCreate = createContactSubmission as jest.MockedFunction<typeof createContactSubmission>;
const mockNotify = notifySupportOfSubmission as jest.MockedFunction<
  typeof notifySupportOfSubmission
>;

function buildHeaders(values: HeaderValues = {}): Headers {
  const h = new Headers();

  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) {
      h.set(key.toLowerCase(), value);
    }
  });

  return h;
}

describe('submitContactSubmission', () => {
  const resetAt = new Date('2024-02-01T00:00:00.000Z');
  const sampleSubmission: ContactSubmissionRecord = {
    id: 'generated-id',
    name: 'Mock User',
    email: 'mock@example.com',
    message: 'Need help',
    origin: 'contact',
    userId: 'user-123',
    metadata: {},
    createdAt: new Date('2024-02-02T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockHeaders.mockResolvedValue(buildHeaders());
    mockLocale.mockReturnValue('es');
    mockGetSession.mockResolvedValue(null);
    mockRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 5,
      resetAt,
      current: 1,
    });
    mockNotify.mockResolvedValue();
    mockCreate.mockResolvedValue(sampleSubmission);
  });

  const defaultRequirements = buildProfileRequirementSummary([]);
  const defaultMetadata = buildProfileMetadata(defaultRequirements);
  const defaultPermissions: PermissionSet = {
    canAccessAdminArea: false,
    canAccessUserArea: true,
    canManageUsers: false,
    canManageEvents: false,
    canViewStaffTools: false,
    canViewOrganizersDashboard: false,
    canViewAthleteDashboard: false,
  };

  it('returns validation error for invalid input', async () => {
    const result = await submitContactSubmission({
      message: '',
      origin: '',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: 'INVALID_INPUT',
        details: expect.anything(),
      }),
    );
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('fails silently when honeypot is filled', async () => {
    const result = await submitContactSubmission({
      message: 'Hello',
      origin: 'footer',
      honeypot: 'bot-data',
    });

    expect(result).toEqual({
      ok: false,
      error: 'VALIDATION_ERROR',
    });
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('blocks anonymous users when IP rate limit is exceeded', async () => {
    const ipResetAt = new Date('2024-03-01T00:00:00.000Z');
    mockHeaders.mockResolvedValue(
      buildHeaders({
        referer: 'https://example.com/contact',
        'x-forwarded-for': '203.0.113.5, 10.0.0.1',
        host: 'example.com',
        'user-agent': 'Jest',
      }),
    );
    mockRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: ipResetAt,
      current: 5,
    });

    const result = await submitContactSubmission({
      message: 'Need help',
      origin: 'contact',
    });

    expect(mockRateLimit).toHaveBeenCalledWith('203.0.113.5', 'ip');
    expect(result).toEqual({
      ok: false,
      error: 'RATE_LIMIT_EXCEEDED',
      resetAt: ipResetAt.toISOString(),
    });
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('blocks authenticated users when user rate limit is exceeded', async () => {
    const userResetAt = new Date('2024-04-01T00:00:00.000Z');
    mockHeaders.mockResolvedValue(
      buildHeaders({
        referer: 'https://example.com/contact',
        'cf-connecting-ip': '198.51.100.10',
        host: 'example.com',
        'user-agent': 'Jest',
      }),
    );
    const rateLimitedSession = {
      roles: [],
      isInternal: false,
      canonicalRoles: [],
      permissions: defaultPermissions,
      needsRoleAssignment: false,
      profileRequirements: defaultRequirements,
      profileMetadata: defaultMetadata,
      profile: null,
      availableExternalRoles: [],
      session: {
        id: 'session-789',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        userId: 'user-789',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        token: 'mock-token-789',
        ipAddress: '198.51.100.10',
        userAgent: 'Jest',
      },
      user: {
        id: 'user-789',
        name: 'Rate Limited User',
        email: 'limited@example.com',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        emailVerified: true,
        image: null,
        isInternal: false,
        canonicalRoles: [],
        permissions: defaultPermissions,
        needsRoleAssignment: false,
        profileRequirements: defaultRequirements,
        profileMetadata: defaultMetadata,
        availableExternalRoles: [],
        profileStatus: EMPTY_PROFILE_STATUS,
      },
    } satisfies SessionResult;
    mockGetSession.mockResolvedValue(rateLimitedSession);
    mockRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: userResetAt,
      current: 10,
    });

    const result = await submitContactSubmission({
      message: 'Need help',
      origin: 'contact',
    });

    expect(mockRateLimit).toHaveBeenCalledWith('user-789', 'user');
    expect(result).toEqual({
      ok: false,
      error: 'RATE_LIMIT_EXCEEDED',
      resetAt: userResetAt.toISOString(),
    });
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('aborts when email notification fails', async () => {
    mockHeaders.mockResolvedValue(
      buildHeaders({
        referer: 'https://example.com/contact',
        'x-forwarded-for': '203.0.113.5',
        host: 'example.com',
        'user-agent': 'Jest',
      }),
    );
    mockNotify.mockRejectedValueOnce(new Error('smtp down'));

    const result = await submitContactSubmission({
      message: 'Need help',
      origin: 'contact',
    });

    expect(result).toEqual({
      ok: false,
      error: 'EMAIL_FAILED',
      message: 'smtp down',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('sends email before storing submission with collected metadata', async () => {
    mockHeaders.mockResolvedValue(
      buildHeaders({
        referer: 'https://example.com/contact',
        'x-forwarded-for': '203.0.113.5, 10.0.0.1',
        host: 'example.com',
        'user-agent': 'Jest',
      }),
    );
    mockLocale.mockReturnValue('en');
    const authenticatedSession = {
      roles: [],
      isInternal: false,
      canonicalRoles: [],
      permissions: defaultPermissions,
      needsRoleAssignment: false,
      profileRequirements: defaultRequirements,
      profileMetadata: defaultMetadata,
      profile: null,
      availableExternalRoles: [],
      session: {
        id: 'session-123',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        userId: 'user-123',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        token: 'mock-token-123',
        ipAddress: '203.0.113.5',
        userAgent: 'Jest',
      },
      user: {
        id: 'user-123',
        name: 'Auth User',
        email: 'auth@example.com',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        emailVerified: true,
        image: null,
        isInternal: false,
        canonicalRoles: [],
        permissions: defaultPermissions,
        needsRoleAssignment: false,
        profileRequirements: defaultRequirements,
        profileMetadata: defaultMetadata,
        availableExternalRoles: [],
        profileStatus: EMPTY_PROFILE_STATUS,
      },
    } satisfies SessionResult;
    mockGetSession.mockResolvedValue(authenticatedSession);
    mockRateLimit.mockResolvedValueOnce({
      allowed: true,
      remaining: 9,
      resetAt,
      current: 1,
    });
    const storedSubmission = {
      id: 'submission-123',
      name: 'Auth User',
      email: 'auth@example.com',
      message: 'Need help',
      origin: 'contact',
      userId: 'user-123',
      metadata: {},
      createdAt: new Date('2024-02-02T00:00:00.000Z'),
    } satisfies ContactSubmissionRecord;
    mockCreate.mockResolvedValueOnce(storedSubmission);

    const result = await submitContactSubmission({
      message: 'Need help',
      origin: 'contact',
      metadata: { context: 'footer' },
    });

    expect(result).toEqual({ ok: true, id: 'submission-123' });
    expect(mockRateLimit).toHaveBeenCalledWith('user-123', 'user');
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      name: 'Auth User',
      email: 'auth@example.com',
      message: 'Need help',
      origin: 'contact',
      userId: 'user-123',
      metadata: {
        context: 'footer',
        preferredLocale: 'en',
        referer: 'https://example.com/contact',
        userAgent: 'Jest',
        ip: '203.0.113.5',
        host: 'example.com',
      },
    });
    const notifyOrder = (mockNotify as jest.Mock).mock.invocationCallOrder[0];
    const createOrder = (mockCreate as jest.Mock).mock.invocationCallOrder[0];
    expect(notifyOrder).toBeLessThan(createOrder);
  });
});
