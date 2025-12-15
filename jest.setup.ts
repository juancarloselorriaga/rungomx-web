// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// In tests we don't need real Next.js caching behavior and it can error
// when `cacheComponents` isn't wired the same way as the app runtime.
// Stub out the caching helpers globally so they are safe no-ops.
jest.mock('next/cache', () => ({
  cacheTag: jest.fn(),
  cacheLife: jest.fn(),
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
}));
