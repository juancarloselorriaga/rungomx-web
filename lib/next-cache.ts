import { cacheLife, cacheTag, refresh, revalidateTag, updateTag } from 'next/cache';

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

function isUpdateTagServerActionOnlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /updateTag can only be called from within a Server Action/i.test(message);
}

function isRefreshServerActionOnlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /refresh\(\) can only be used in a Server Action/i.test(message) ||
    /refresh can only be called from within a Server Action/i.test(message)
  );
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

export function safeUpdateTag(tag: string) {
  try {
    updateTag(tag);
  } catch (error) {
    if (isUpdateTagServerActionOnlyError(error)) {
      revalidateTag(tag, { expire: 0 });
      return;
    }

    if (shouldSuppressCacheError() || isMissingStaticGenerationStoreError(error)) return;
    throw error;
  }
}

export function safeRefresh() {
  try {
    refresh();
  } catch (error) {
    if (isRefreshServerActionOnlyError(error)) {
      return;
    }

    if (shouldSuppressCacheError() || isMissingStaticGenerationStoreError(error)) return;
    throw error;
  }
}
