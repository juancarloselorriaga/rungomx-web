import {
  EVENT_MEDIA_IMAGE_TYPES,
  EVENT_MEDIA_MAX_FILE_SIZE,
} from './constants';

export type EventImageValidationResult =
  | { valid: true }
  | { valid: false; reason: 'invalid_type' | 'file_too_large' };

export function validateEventImageFile(file: File): EventImageValidationResult {
  if (!EVENT_MEDIA_IMAGE_TYPES.includes(file.type as (typeof EVENT_MEDIA_IMAGE_TYPES)[number])) {
    return { valid: false, reason: 'invalid_type' };
  }
  if (file.size > EVENT_MEDIA_MAX_FILE_SIZE) {
    return { valid: false, reason: 'file_too_large' };
  }
  return { valid: true };
}
