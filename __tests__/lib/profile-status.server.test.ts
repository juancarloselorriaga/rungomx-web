import { computeProfileStatus } from '@/lib/profiles/status';
import type { ProfileRecord } from '@/lib/profiles/types';

describe('computeProfileStatus', () => {
  const baseProfile: ProfileRecord = {
    userId: 'user-1',
    phone: '555-0000',
    city: 'CDMX',
    state: 'CDMX',
    dateOfBirth: new Date('1990-01-01'),
    emergencyContactName: 'Contact',
    emergencyContactPhone: '555-1111',
  bio: null,
  gender: null,
  genderDescription: null,
  postalCode: null,
  country: 'MX',
  latitude: null,
  longitude: null,
  locationDisplay: null,
    medicalConditions: null,
    bloodType: null,
    shirtSize: null,
    weightKg: null,
    heightCm: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  it('flags missing profile as incomplete', () => {
    const status = computeProfileStatus({ profile: null });

    expect(status).toEqual({
      hasProfile: false,
      isComplete: false,
      mustCompleteProfile: true,
    });
  });

  it('requires all mandatory fields to be present', () => {
    const status = computeProfileStatus({
      profile: { ...baseProfile, phone: null },
    });

    expect(status.hasProfile).toBe(true);
    expect(status.isComplete).toBe(false);
    expect(status.mustCompleteProfile).toBe(true);
  });

  it('marks profile complete when required fields exist', () => {
    const status = computeProfileStatus({ profile: baseProfile });

    expect(status).toEqual({
      hasProfile: true,
      isComplete: true,
      mustCompleteProfile: false,
    });
  });

  it('bypasses enforcement for internal users', () => {
    const status = computeProfileStatus({
      profile: { ...baseProfile, phone: null },
      isInternal: true,
    });

    expect(status.mustCompleteProfile).toBe(false);
  });

  it('uses role-based requirement categories when provided', () => {
    const status = computeProfileStatus({
      profile: { ...baseProfile, shirtSize: null },
      requirementCategories: [
        'basicContact',
        'emergencyContact',
        'demographics',
        'physicalAttributes',
      ],
    });

    expect(status.isComplete).toBe(false);

    const resolved = computeProfileStatus({
      profile: { ...baseProfile, shirtSize: 'm' },
      requirementCategories: [
        'basicContact',
        'emergencyContact',
        'demographics',
        'physicalAttributes',
      ],
    });

    expect(resolved.isComplete).toBe(true);
  });
});
