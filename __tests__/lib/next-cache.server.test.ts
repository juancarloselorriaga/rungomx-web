const mockRefresh = jest.fn();
const mockRevalidateTag = jest.fn();
const mockUpdateTag = jest.fn();

jest.mock('next/cache', () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
  refresh: (...args: unknown[]) => mockRefresh(...args),
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
  updateTag: (...args: unknown[]) => mockUpdateTag(...args),
}));

import { safeRefresh } from '@/lib/next-cache';

describe('safeRefresh', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockRevalidateTag.mockReset();
    mockUpdateTag.mockReset();
  });

  it('suppresses the route-handler refresh error instead of throwing', () => {
    mockRefresh.mockImplementation(() => {
      throw new Error('refresh() can only be used in a Server Action');
    });

    expect(() => safeRefresh()).not.toThrow();
  });

  it('suppresses the newer route-handler refresh error wording instead of throwing', () => {
    mockRefresh.mockImplementation(() => {
      throw new Error('refresh can only be called from within a Server Action');
    });

    expect(() => safeRefresh()).not.toThrow();
  });
});
