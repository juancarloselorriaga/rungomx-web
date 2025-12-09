import type { ProfileRecord, ProfileUpsertInput } from '@/lib/profiles/types';

export type ProfileFormValuesBase = {
  phone?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  locationDisplay?: string;
  dateOfBirth?: string;
  gender?: string;
  genderDescription?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  shirtSize?: string;
  bloodType?: string;
  bio?: string;
  medicalConditions?: string;
  weightKg?: string;
  heightCm?: string;
};

export function formatProfileDateInput(value?: string | Date | null) {
  if (!value) return '';

  const toIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  if (value instanceof Date) {
    return toIsoDate(value);
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : toIsoDate(parsed);
}

export function formatNumericProfileInput(value?: number | string | null) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return value.trim();
}

export function normalizeCountryCode(
  value: string | null | undefined,
  fallback: string
) {
  const country = value?.trim() || fallback;
  return country.toUpperCase();
}

export function applyGenderToPayload(
  payload: Record<string, unknown>,
  gender: string,
  genderDescription: string | undefined
) {
  const trimmedGender = gender?.trim?.() ?? '';
  if (trimmedGender) {
    payload.gender = trimmedGender;
  }

  const description = genderDescription?.trim?.() ?? '';

  if (trimmedGender === 'self_described' && description) {
    payload.genderDescription = description;
  } else if (trimmedGender !== 'self_described') {
    payload.genderDescription = null;
  }
}

export function toProfileFormValuesFromRecord(
  profile: ProfileRecord | null,
  defaults: Required<ProfileFormValuesBase>
): Required<ProfileFormValuesBase> {
  if (!profile) return { ...defaults };

  return {
    phone: profile.phone ?? defaults.phone,
    city: profile.city ?? defaults.city,
    state: profile.state ?? defaults.state,
    postalCode: profile.postalCode ?? defaults.postalCode,
    country: normalizeCountryCode(
      profile.country ?? defaults.country,
      defaults.country
    ),
    locationDisplay: profile.locationDisplay ?? defaults.locationDisplay,
    dateOfBirth: formatProfileDateInput(profile.dateOfBirth),
    gender: profile.gender ?? defaults.gender,
    genderDescription: profile.genderDescription ?? defaults.genderDescription,
    emergencyContactName:
      profile.emergencyContactName ?? defaults.emergencyContactName,
    emergencyContactPhone:
      profile.emergencyContactPhone ?? defaults.emergencyContactPhone,
    shirtSize: profile.shirtSize ?? defaults.shirtSize,
    bloodType: profile.bloodType ?? defaults.bloodType,
    bio: profile.bio ?? defaults.bio,
    medicalConditions: profile.medicalConditions ?? defaults.medicalConditions,
    weightKg: formatNumericProfileInput(profile.weightKg ?? defaults.weightKg),
    heightCm: formatNumericProfileInput(profile.heightCm ?? defaults.heightCm),
  };
}

export function buildProfileUpsertPayloadFromForm(
  values: ProfileFormValuesBase,
  countryFallback: string
): ProfileUpsertInput {
  const payload: Record<string, unknown> = {};

  const assign = (key: keyof ProfileUpsertInput, raw: string | undefined) => {
    const trimmed = raw?.trim?.() ?? '';
    if (!trimmed) return;
    payload[key] = trimmed;
  };

  assign('phone', values.phone);
  assign('city', values.city);
  assign('state', values.state);
  assign('postalCode', values.postalCode);

  const country = normalizeCountryCode(values.country ?? '', countryFallback);
  assign('country', country);

  assign('locationDisplay', values.locationDisplay);
  assign('dateOfBirth', values.dateOfBirth);

  applyGenderToPayload(payload, values.gender ?? '', values.genderDescription);

  assign('emergencyContactName', values.emergencyContactName);
  assign('emergencyContactPhone', values.emergencyContactPhone);
  assign('shirtSize', values.shirtSize);
  assign('bloodType', values.bloodType);
  assign('bio', values.bio);
  assign('medicalConditions', values.medicalConditions);
  assign('weightKg', values.weightKg);
  assign('heightCm', values.heightCm);

  return payload as ProfileUpsertInput;
}
