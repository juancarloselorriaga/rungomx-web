import { cacheLife, cacheTag } from 'next/cache';

type CacheLifeConfig = {
  stale?: number;
  revalidate?: number;
  expire?: number;
};

function shouldSuppressCacheError() {
  return process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';
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
    if (typeof profile === 'string') {
      cacheLife(profile);
    } else {
      cacheLife(profile);
    }
  } catch (error) {
    if (shouldSuppressCacheError()) return;
    throw error;
  }
}
