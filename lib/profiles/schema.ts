import { z } from 'zod';
import { SHIRT_SIZES, BLOOD_TYPES, GENDER_CODES } from './metadata';
import { optionalPhoneNumber } from '@/lib/phone/schema';

const optionalTrimmedString = (maxLength: number) =>
  z.preprocess((val) => {
    if (val === null || val === undefined) return undefined;
    if (typeof val !== 'string') return val;

    const trimmed = val.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().min(1).max(maxLength).optional());

const optionalCountryCode = () =>
  z.preprocess((val) => {
    if (val === null || val === undefined) return undefined;
    if (typeof val !== 'string') return val;

    const trimmed = val.trim().toUpperCase();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/, { message: 'Invalid country code' })
    .optional());

const optionalText = () =>
  z.preprocess((val) => {
    if (val === null || val === undefined) return undefined;
    if (typeof val !== 'string') return val;

    const trimmed = val.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().max(5000).optional());

const optionalNumber = () =>
  z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return undefined;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return undefined;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : val;
    }
    return val;
  }, z.number().optional());

const optionalDate = z.preprocess((val) => {
  if (val === null || val === undefined || val === '') return undefined;
  return val;
}, z.coerce.date().optional());

const optionalEnum = <TValues extends readonly [string, ...string[]]>(values: TValues) =>
  z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return undefined;
    if (typeof val !== 'string') return val;
    return val.trim().toLowerCase();
  }, z.enum(values).optional());

const MIN_AGE_YEARS = 13;
const MAX_AGE_YEARS = 100;
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 250;
const MIN_HEIGHT_CM = 120;
const MAX_HEIGHT_CM = 230;

function calculateAgeYears(date: Date) {
  const diff = Date.now() - date.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

export const profileSchema = z.object({
  userId: z.uuid(),
  bio: optionalTrimmedString(500),
  dateOfBirth: optionalDate,
  gender: optionalEnum(GENDER_CODES),
  genderDescription: optionalTrimmedString(100),
  phone: optionalPhoneNumber,
  city: optionalTrimmedString(100),
  state: optionalTrimmedString(100),
  postalCode: optionalTrimmedString(10),
  country: optionalCountryCode(),
  latitude: optionalNumber(),
  longitude: optionalNumber(),
  locationDisplay: optionalTrimmedString(255),
  emergencyContactName: optionalTrimmedString(100),
  emergencyContactPhone: optionalPhoneNumber,
  medicalConditions: optionalText(),
  bloodType: optionalEnum(BLOOD_TYPES),
  shirtSize: optionalEnum(SHIRT_SIZES),
  weightKg: optionalNumber(),
  heightCm: optionalNumber(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  deletedAt: z.date().nullable().optional(),
});

export const profileUpsertSchema = profileSchema.omit({
  userId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type ProfileRecord = z.infer<typeof profileSchema>;

export function createProfileValidationSchema(requiredFields: (keyof ProfileRecord)[]) {
  return profileUpsertSchema.superRefine((data, ctx) => {
    requiredFields.forEach((field) => {
      const value = data[field as keyof typeof data];
      const isEmpty =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '');

      if (isEmpty) {
        ctx.addIssue({
          code: 'custom',
          message: 'This field is required',
          path: [field],
        });
      }
    });

    if (data.dateOfBirth) {
      const age = calculateAgeYears(data.dateOfBirth);
      if (age < MIN_AGE_YEARS) {
        ctx.addIssue({
          code: 'custom',
          message: `Must be at least ${MIN_AGE_YEARS} years old`,
          path: ['dateOfBirth'],
        });
      }

      if (age > MAX_AGE_YEARS) {
        ctx.addIssue({
          code: 'custom',
          message: 'Enter a valid date of birth',
          path: ['dateOfBirth'],
        });
      }
    }

    const country = (data.country ?? 'MX').toUpperCase();

    if (data.postalCode && country === 'MX' && !/^[0-9]{5}$/.test(data.postalCode)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid postal code',
        path: ['postalCode'],
      });
    }

    if (data.weightKg !== undefined) {
      if (data.weightKg < MIN_WEIGHT_KG || data.weightKg > MAX_WEIGHT_KG) {
        ctx.addIssue({
          code: 'custom',
          message: `Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg`,
          path: ['weightKg'],
        });
      }
    }

    if (data.heightCm !== undefined) {
      if (data.heightCm < MIN_HEIGHT_CM || data.heightCm > MAX_HEIGHT_CM) {
        ctx.addIssue({
          code: 'custom',
          message: `Height must be between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm`,
          path: ['heightCm'],
        });
      }
    }

    if (data.latitude !== undefined) {
      if (data.latitude < -90 || data.latitude > 90) {
        ctx.addIssue({
          code: 'custom',
          message: 'Latitude must be between -90 and 90',
          path: ['latitude'],
        });
      }
    }

    if (data.longitude !== undefined) {
      if (data.longitude < -180 || data.longitude > 180) {
        ctx.addIssue({
          code: 'custom',
          message: 'Longitude must be between -180 and 180',
          path: ['longitude'],
        });
      }
    }

    if (data.genderDescription && data.gender !== 'self_described') {
      ctx.addIssue({
        code: 'custom',
        message: 'Self description is only used when selecting self describe',
        path: ['genderDescription'],
      });
    }
  });
}
