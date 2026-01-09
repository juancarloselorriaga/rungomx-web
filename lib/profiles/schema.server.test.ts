jest.mock('next-intl/routing', () => ({
  defineRouting: jest.fn(() => ({
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed',
    pathnames: {},
  })),
}));

import { accountNameUpdateSchema, passwordChangeSchema } from '@/lib/auth/account-schemas';
import { createProfileValidationSchema } from '@/lib/profiles/schema';
import type { ProfileUpsertInput } from '@/lib/profiles/types';

const FIXED_NOW = new Date('2025-01-01T00:00:00Z');

const yearsAgo = (years: number) => {
  // Anchor to a fixed "today" to avoid flakiness around birthdays.
  return new Date(
    Date.UTC(FIXED_NOW.getUTCFullYear() - years, FIXED_NOW.getUTCMonth(), FIXED_NOW.getUTCDate()),
  );
};

let nowSpy: jest.SpyInstance<number, []>;

beforeAll(() => {
  nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW.getTime());
});

afterAll(() => {
  nowSpy.mockRestore();
});

const baseProfile = (overrides: Partial<ProfileUpsertInput> = {}): ProfileUpsertInput => ({
  phone: '+523317778888',
  city: 'CDMX',
  state: 'CDMX',
  dateOfBirth: yearsAgo(30),
  emergencyContactName: 'Contact Name',
  emergencyContactPhone: '+523317778889',
  postalCode: '12345',
  country: 'MX',
  gender: 'male',
  genderDescription: undefined,
  shirtSize: 'm',
  weightKg: 75,
  heightCm: 180,
  ...overrides,
});

describe('profileValidationSchema', () => {
  const requiredFields: (keyof ProfileUpsertInput)[] = [
    'phone',
    'city',
    'state',
    'dateOfBirth',
    'emergencyContactName',
    'emergencyContactPhone',
  ];

  it('fails validation for users younger than 13', () => {
    const schema = createProfileValidationSchema(requiredFields);
    const result = schema.safeParse(baseProfile({ dateOfBirth: yearsAgo(12) }));

    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(
      'dateOfBirth',
    );
  });

  it('allows users aged 13 through 100', () => {
    const schema = createProfileValidationSchema(requiredFields);

    const teen = schema.safeParse(baseProfile({ dateOfBirth: yearsAgo(13) }));
    const centenarian = schema.safeParse(baseProfile({ dateOfBirth: yearsAgo(100) }));

    expect(teen.success).toBe(true);
    expect(centenarian.success).toBe(true);
  });

  it('rejects ages above the maximum', () => {
    const schema = createProfileValidationSchema(requiredFields);
    const result = schema.safeParse(baseProfile({ dateOfBirth: yearsAgo(101) }));

    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(
      'dateOfBirth',
    );
  });

  it('enforces MX postal code format only for MX addresses', () => {
    const schema = createProfileValidationSchema(requiredFields);

    expect(schema.safeParse(baseProfile({ postalCode: '12345' })).success).toBe(true);
    expect(schema.safeParse(baseProfile({ postalCode: '1234' })).success).toBe(false);
    expect(schema.safeParse(baseProfile({ postalCode: 'ABCDE' })).success).toBe(false);
    expect(schema.safeParse(baseProfile({ country: 'US', postalCode: 'ABCDE' })).success).toBe(
      true,
    );
  });

  it('clears genderDescription when gender is not self_described', () => {
    const schema = createProfileValidationSchema(requiredFields);
    const result = schema.parse(
      baseProfile({ gender: 'female', genderDescription: 'Should be dropped' }),
    );

    expect(result.gender).toBe('female');
    expect(result.genderDescription).toBeUndefined();
  });

  it('retains genderDescription only for self_described gender', () => {
    const schema = createProfileValidationSchema(requiredFields);
    const described = schema.parse(
      baseProfile({ gender: 'self_described', genderDescription: 'Runner' }),
    );
    const noDescription = schema.parse(
      baseProfile({ gender: 'self_described', genderDescription: undefined }),
    );

    expect(described.genderDescription).toBe('Runner');
    expect(noDescription.genderDescription).toBeUndefined();
  });

  it('validates physical measurement boundaries', () => {
    const schema = createProfileValidationSchema(requiredFields);

    expect(schema.safeParse(baseProfile({ weightKg: 29.9 })).success).toBe(false);
    expect(schema.safeParse(baseProfile({ weightKg: 30 })).success).toBe(true);
    expect(schema.safeParse(baseProfile({ weightKg: 250 })).success).toBe(true);
    expect(schema.safeParse(baseProfile({ weightKg: 250.1 })).success).toBe(false);

    expect(schema.safeParse(baseProfile({ heightCm: 119 })).success).toBe(false);
    expect(schema.safeParse(baseProfile({ heightCm: 120 })).success).toBe(true);
    expect(schema.safeParse(baseProfile({ heightCm: 230 })).success).toBe(true);
    expect(schema.safeParse(baseProfile({ heightCm: 231 })).success).toBe(false);
  });

  it('enforces required fields based on role requirements', () => {
    const athleteSchema = createProfileValidationSchema([...requiredFields, 'shirtSize']);
    const organizerSchema = createProfileValidationSchema(requiredFields);
    const internalSchema = createProfileValidationSchema([]);

    expect(athleteSchema.safeParse(baseProfile({ shirtSize: undefined })).success).toBe(false);
    expect(organizerSchema.safeParse(baseProfile({ shirtSize: undefined })).success).toBe(true);

    expect(athleteSchema.safeParse(baseProfile({ emergencyContactPhone: '' })).success).toBe(false);
    expect(organizerSchema.safeParse(baseProfile({ phone: '' })).success).toBe(false);

    expect(
      internalSchema.safeParse(
        baseProfile({
          phone: '',
          city: '',
          state: '',
          emergencyContactPhone: '',
          emergencyContactName: '',
          dateOfBirth: undefined,
        }),
      ).success,
    ).toBe(true);
  });
});

describe('accountNameUpdateSchema', () => {
  it('fails on empty or whitespace-only names', () => {
    expect(accountNameUpdateSchema.safeParse({ name: '' }).success).toBe(false);
    expect(accountNameUpdateSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('trims and accepts valid names', () => {
    const parsed = accountNameUpdateSchema.parse({ name: '  Valid Name ' });
    expect(parsed.name).toBe('Valid Name');
  });

  it('rejects names longer than 255 characters', () => {
    expect(accountNameUpdateSchema.safeParse({ name: 'a'.repeat(256) }).success).toBe(false);
  });
});

describe('passwordChangeSchema', () => {
  it('enforces minimum and maximum password lengths', () => {
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: 'current-pass',
        newPassword: 'short7',
      }).success,
    ).toBe(false);

    expect(
      passwordChangeSchema.safeParse({
        currentPassword: 'current-pass',
        newPassword: 'longpass',
      }).success,
    ).toBe(true);

    expect(
      passwordChangeSchema.safeParse({
        currentPassword: 'current-pass',
        newPassword: 'a'.repeat(128),
      }).success,
    ).toBe(true);

    expect(
      passwordChangeSchema.safeParse({
        currentPassword: 'current-pass',
        newPassword: 'a'.repeat(129),
      }).success,
    ).toBe(false);
  });
});
