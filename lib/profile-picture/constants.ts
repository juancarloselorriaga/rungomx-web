export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_FILE_SIZE_MB = 5;

export const MAX_DIMENSION = 1024; // Max width/height in pixels
export const OUTPUT_QUALITY = 0.85; // JPEG/WebP compression quality
export const OUTPUT_FORMAT = 'image/webp';

export const BLOB_STORE_PREFIX = 'profile-pictures';
