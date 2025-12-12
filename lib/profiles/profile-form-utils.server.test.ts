import { buildProfileUpsertPayloadFromForm } from '@/lib/profiles/profile-form-utils';
import type { ProfileUpsertInput } from '@/lib/profiles/types';

describe('buildProfileUpsertPayloadFromForm', () => {
  it('includes latitude and longitude when provided', () => {
    const values = {
      phone: '+523317778888',
      city: 'CDMX',
      state: 'CDMX',
      postalCode: '12345',
      country: 'MX',
      latitude: '19.4326',
      longitude: '-99.1332',
      locationDisplay: 'Mexico City, MX',
      dateOfBirth: '',
      gender: '',
      genderDescription: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      shirtSize: '',
      bloodType: '',
      bio: '',
      medicalConditions: '',
      weightKg: '',
      heightCm: '',
    };

    const payload = buildProfileUpsertPayloadFromForm(values, 'MX');

    expect((payload as ProfileUpsertInput).latitude).toBe('19.4326');
    expect((payload as ProfileUpsertInput).longitude).toBe('-99.1332');
    expect((payload as ProfileUpsertInput).locationDisplay).toBe(
      'Mexico City, MX'
    );
  });
});

