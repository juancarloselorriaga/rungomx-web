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
