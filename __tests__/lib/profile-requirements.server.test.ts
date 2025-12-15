import { buildProfileRequirementSummary } from '@/lib/profiles/requirements';
import { createProfileValidationSchema } from '@/lib/profiles/schema';
import type { ProfileUpsertInput } from '@/lib/profiles/types';

const yearsAgo = (years: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
};

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
  shirtSize: 'm',
  ...overrides,
});

describe('Profile Requirements by Role', () => {
  it('enforces additional athlete requirements', () => {
    const athleteRequirements = buildProfileRequirementSummary([
      'basicContact',
      'emergencyContact',
      'demographics',
      'physicalAttributes',
    ]);
    const athleteSchema = createProfileValidationSchema(athleteRequirements.fieldKeys);

    expect(athleteSchema.safeParse(baseProfile({ shirtSize: undefined })).success).toBe(false);
    expect(athleteSchema.safeParse(baseProfile({ emergencyContactPhone: '' })).success).toBe(false);
    expect(athleteSchema.safeParse(baseProfile()).success).toBe(true);
  });

  it('omits shirtSize for organizer requirements but keeps core contact fields', () => {
    const organizerRequirements = buildProfileRequirementSummary([
      'basicContact',
      'emergencyContact',
      'demographics',
    ]);
    const organizerSchema = createProfileValidationSchema(organizerRequirements.fieldKeys);

    expect(organizerSchema.safeParse(baseProfile({ shirtSize: undefined })).success).toBe(true);
    expect(organizerSchema.safeParse(baseProfile({ phone: '' })).success).toBe(false);
    expect(organizerSchema.safeParse(baseProfile({ city: '' })).success).toBe(false);
  });

  it('treats all fields as optional for internal users', () => {
    const internalSchema = createProfileValidationSchema([]);

    const result = internalSchema.safeParse(
      baseProfile({
        phone: '',
        city: '',
        state: '',
        dateOfBirth: undefined,
        emergencyContactName: '',
        emergencyContactPhone: '',
        shirtSize: undefined,
      }),
    );

    expect(result.success).toBe(true);
  });
});
