export const EVENT_MEDIA_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

export const EVENT_MEDIA_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const EVENT_MEDIA_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const EVENT_MEDIA_BLOB_PREFIX = 'event-media';

export const EVENT_MEDIA_GROUP_REGISTRATION_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const EVENT_MEDIA_GROUP_REGISTRATION_MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
