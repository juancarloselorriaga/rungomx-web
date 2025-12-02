import { z } from 'zod';
import { SHIRT_SIZES } from './metadata';

const optionalTrimmedString = (maxLength: number) =>
  z.preprocess((val) => {
    if (val === null || val === undefined) return undefined;
    if (typeof val !== 'string') return val;

    const trimmed = val.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().min(1).max(maxLength).optional());

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

export const profileSchema = z.object({
  userId: z.uuid(),
  bio: optionalTrimmedString(500),
  dateOfBirth: optionalDate,
  gender: optionalTrimmedString(20),
  phone: optionalTrimmedString(20),
  city: optionalTrimmedString(100),
  state: optionalTrimmedString(100),
  postalCode: optionalTrimmedString(10),
  country: optionalTrimmedString(2),
  latitude: optionalNumber(),
  longitude: optionalNumber(),
  locationDisplay: optionalTrimmedString(255),
  emergencyContactName: optionalTrimmedString(100),
  emergencyContactPhone: optionalTrimmedString(20),
  medicalConditions: optionalText(),
  bloodType: optionalTrimmedString(5),
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
