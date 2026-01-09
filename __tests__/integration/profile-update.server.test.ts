jest.mock('next-intl/routing', () => ({
  defineRouting: jest.fn(() => ({
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed',
    pathnames: {},
  })),
}));

import { upsertProfileAction } from '@/app/actions/profile';
import { buildProfileMetadata } from '@/lib/profiles/metadata';
import { buildProfileRequirementSummary } from '@/lib/profiles/requirements';
import type { ProfileRecord, ProfileUpsertInput } from '@/lib/profiles/types';
import { headers } from 'next/headers';

const mockRequireAuth = jest.fn();
let mockUpsertProfile: jest.Mock<Promise<ProfileRecord>, [string, ProfileUpsertInput]>;
let mockGetSession: jest.Mock;

function upsertProfileProxy(...args: Parameters<typeof mockUpsertProfile>) {
  return mockUpsertProfile(...args);
}

function getSessionProxy(...args: unknown[]) {
  return mockGetSession(...args);
}

jest.mock('@/lib/auth/guards', () => ({
  requireAuthenticatedUser: (...args: unknown[]) => mockRequireAuth(...args),
}));

jest.mock('@/lib/profiles/repository', () => ({
  upsertProfile: (...args: unknown[]) =>
    upsertProfileProxy(...(args as [string, ProfileUpsertInput])),
  getProfileByUserId: jest.fn(),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
}));

jest.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => getSessionProxy(...args),
    },
  },
}));

const requirements = buildProfileRequirementSummary([
  'basicContact',
  'emergencyContact',
  'demographics',
  'physicalAttributes',
]);
const metadata = buildProfileMetadata(requirements);
const mockHeaders = headers as jest.MockedFunction<typeof headers>;

const yearsAgo = (years: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
};

const baseInput: ProfileUpsertInput = {
  phone: '+523317778888',
  city: 'CDMX',
  state: 'CDMX',
  dateOfBirth: yearsAgo(30),
  emergencyContactName: 'Contact Name',
  emergencyContactPhone: '+523317778889',
  postalCode: '12345',
  country: 'MX',
  gender: 'self_described',
  genderDescription: 'Runner',
  shirtSize: 'm',
  bloodType: 'o+',
  bio: 'Loves running',
  weightKg: 72,
  heightCm: 178,
};

const profileFromInput = (userId: string, input: ProfileUpsertInput): ProfileRecord => ({
  userId,
  bio: input.bio ?? null,
  dateOfBirth: input.dateOfBirth ?? null,
  gender: input.gender ?? null,
  genderDescription: input.gender === 'self_described' ? (input.genderDescription ?? null) : null,
  phone: input.phone ?? null,
  city: input.city ?? null,
  state: input.state ?? null,
  postalCode: input.postalCode ?? null,
  country: (input.country ?? 'MX') as ProfileRecord['country'],
  latitude: (input.latitude ?? null) as ProfileRecord['latitude'],
  longitude: (input.longitude ?? null) as ProfileRecord['longitude'],
  locationDisplay: input.locationDisplay ?? null,
  emergencyContactName: input.emergencyContactName ?? null,
  emergencyContactPhone: input.emergencyContactPhone ?? null,
  medicalConditions: input.medicalConditions ?? null,
  bloodType: input.bloodType ?? null,
  shirtSize: input.shirtSize ?? null,
  weightKg: (input.weightKg ?? null) as ProfileRecord['weightKg'],
  heightCm: (input.heightCm ?? null) as ProfileRecord['heightCm'],
  locale: (input.locale ?? null) as ProfileRecord['locale'],
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
});

describe('Profile Update Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertProfile = jest.fn<Promise<ProfileRecord>, [string, ProfileUpsertInput]>();
    mockGetSession = jest.fn();
    mockRequireAuth.mockResolvedValue({
      user: { id: 'user-1' },
      isInternal: false,
      profileRequirements: requirements,
      profileMetadata: metadata,
    });
    mockUpsertProfile.mockImplementation(async (_userId, input) =>
      profileFromInput('user-1', input),
    );
  });

  it('updates the profile with valid data and refreshes the session', async () => {
    const result = await upsertProfileAction(baseInput);

    expect(mockUpsertProfile).toHaveBeenCalledWith('user-1', expect.objectContaining(baseInput));
    expect(mockGetSession).toHaveBeenCalledWith({
      headers: await mockHeaders.mock.results[0].value,
      query: { disableCookieCache: true },
    });
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        profileStatus: expect.objectContaining({ isComplete: true }),
        profile: expect.objectContaining({ phone: baseInput.phone }),
      }),
    );
  });

  it('returns a field error when age is below 13 and does not update the database', async () => {
    const result = await upsertProfileAction({
      ...baseInput,
      dateOfBirth: yearsAgo(12),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: 'INVALID_INPUT',
      }),
    );
    expect(
      (result as { fieldErrors?: Record<string, string[]> }).fieldErrors?.dateOfBirth,
    ).toBeDefined();
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('rejects invalid MX postal codes without touching persistence', async () => {
    const result = await upsertProfileAction({
      ...baseInput,
      postalCode: '1234',
    });

    expect(result.ok).toBe(false);
    expect(
      (result as { fieldErrors?: Record<string, string[]> }).fieldErrors?.postalCode,
    ).toBeDefined();
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('persists gender description when self_described is selected', async () => {
    const input: ProfileUpsertInput = {
      ...baseInput,
      gender: 'self_described',
      genderDescription: 'Trail runner',
    };

    const result = await upsertProfileAction(input);

    expect(mockUpsertProfile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ genderDescription: 'Trail runner' }),
    );
    expect(result.ok).toBe(true);
    expect((result as { profile?: ProfileRecord }).profile?.genderDescription).toBe('Trail runner');
  });

  it('clears genderDescription when changing away from self_described', async () => {
    const input: ProfileUpsertInput = {
      ...baseInput,
      gender: 'male',
      genderDescription: 'Old description',
    };

    const result = await upsertProfileAction(input);

    expect(mockUpsertProfile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ genderDescription: undefined }),
    );
    expect(result.ok).toBe(true);
    expect((result as { profile?: ProfileRecord }).profile?.genderDescription).toBeNull();
  });

  describe('Country Code Validation', () => {
    it('accepts valid country codes (MX, US, CA, ES, BR)', async () => {
      const validCountries = ['MX', 'US', 'CA', 'ES', 'BR'] as const;

      for (const country of validCountries) {
        const result = await upsertProfileAction({
          ...baseInput,
          country,
        });

        expect(result.ok).toBe(true);
        expect((result as { profile?: ProfileRecord }).profile?.country).toBe(country);
      }
    });

    it('accepts additional valid country codes from expanded list', async () => {
      const additionalCountries = ['JP', 'FR', 'DE', 'CN', 'IN', 'AU', 'GB', 'IT'] as const;

      for (const country of additionalCountries) {
        const result = await upsertProfileAction({
          ...baseInput,
          country,
        });

        expect(result.ok).toBe(true);
        expect((result as { profile?: ProfileRecord }).profile?.country).toBe(country);
      }
    });

    it('normalizes lowercase country codes to uppercase', async () => {
      const result = await upsertProfileAction({
        ...baseInput,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing purposes
        country: 'mx' as any,
      });

      expect(result.ok).toBe(true);
      expect(mockUpsertProfile).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ country: 'MX' }),
      );
    });

    it('rejects invalid country codes', async () => {
      const invalidCountries = ['ZZ', 'XX', 'INVALID', '123'];

      for (const country of invalidCountries) {
        const result = await upsertProfileAction({
          ...baseInput,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing purposes
          country: country as any,
        });

        expect(result.ok).toBe(false);
        expect(
          (result as { fieldErrors?: Record<string, string[]> }).fieldErrors?.country,
        ).toBeDefined();
        expect(mockUpsertProfile).not.toHaveBeenCalled();
        jest.clearAllMocks();
      }
    });

    it('accepts empty/undefined country and defaults to MX', async () => {
      const result = await upsertProfileAction({
        ...baseInput,
        country: undefined,
      });

      expect(result.ok).toBe(true);
      expect((result as { profile?: ProfileRecord }).profile?.country).toBe('MX');
    });
  });
});
