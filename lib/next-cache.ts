import { cacheLife, cacheTag, revalidateTag } from 'next/cache';

type CacheLifeConfig = {
  stale?: number;
  revalidate?: number;
  expire?: number;
};

function shouldSuppressCacheError() {
  return process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';
}

function isMissingStaticGenerationStoreError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('static generation store missing');
}

export function safeCacheTag(...tags: string[]) {
  try {
    cacheTag(...tags);
  } catch (error) {
    if (shouldSuppressCacheError()) return;
    throw error;
  }
}

export function safeCacheLife(profile: string | CacheLifeConfig) {
  try {
    if (typeof profile === 'string') return;
    cacheLife(profile);
  } catch (error) {
    if (shouldSuppressCacheError()) return;
    throw error;
  }
}

export function safeRevalidateTag(tag: string, profile?: string | CacheLifeConfig) {
  try {
    revalidateTag(tag, profile ?? 'max');
  } catch (error) {
    if (shouldSuppressCacheError() || isMissingStaticGenerationStoreError(error)) return;
    throw error;
  }
}
