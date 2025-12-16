import type { CleanupUnverifiedUsersResult } from '@/lib/auth/cleanup-unverified-users';

const mockCleanup = jest.fn<Promise<CleanupUnverifiedUsersResult>, [Date]>();

jest.mock('@/lib/auth/cleanup-unverified-users', () => ({
  cleanupExpiredUnverifiedUsers: (...args: [Date]) => mockCleanup(...args),
}));

import { GET } from '@/app/api/cron/cleanup-unverified-users/route';

// Helper to set NODE_ENV without TypeScript readonly error
const setNodeEnv = (value: string) => {
  (process.env as { NODE_ENV: string }).NODE_ENV = value;
};

describe('Cron Route Handler - cleanup-unverified-users', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Authorization', () => {
    it('returns 401 without authorization header in production', async () => {
      process.env.CRON_SECRET = 'my-secret';
      setNodeEnv('production');

      const request = new Request('http://localhost/api/cron/cleanup-unverified-users');

      const response = await GET(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ error: 'Unauthorized' });
      expect(mockCleanup).not.toHaveBeenCalled();
    });

    it('returns 401 with invalid Bearer token', async () => {
      process.env.CRON_SECRET = 'my-secret';
      setNodeEnv('production');

      const request = new Request('http://localhost/api/cron/cleanup-unverified-users', {
        headers: {
          authorization: 'Bearer wrong-secret',
        },
      });

      const response = await GET(request);

      expect(response.status).toBe(401);
      expect(mockCleanup).not.toHaveBeenCalled();
    });

    it('accepts valid CRON_SECRET Bearer token', async () => {
      process.env.CRON_SECRET = 'my-secret';
      setNodeEnv('production');

      mockCleanup.mockResolvedValueOnce({
        cutoff: new Date(),
        candidates: 5,
        deleted: 5,
      });

      const request = new Request('http://localhost/api/cron/cleanup-unverified-users', {
        headers: {
          authorization: 'Bearer my-secret',
        },
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('accepts x-vercel-cron header in development only', async () => {
      delete process.env.CRON_SECRET;
      setNodeEnv('development');

      mockCleanup.mockResolvedValueOnce({
        cutoff: new Date(),
        candidates: 0,
        deleted: 0,
      });

      const request = new Request('http://localhost/api/cron/cleanup-unverified-users', {
        headers: {
          'x-vercel-cron': '1',
        },
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('rejects x-vercel-cron header in production without CRON_SECRET', async () => {
      delete process.env.CRON_SECRET;
      setNodeEnv('production');

      const request = new Request('http://localhost/api/cron/cleanup-unverified-users', {
        headers: {
          'x-vercel-cron': '1',
        },
      });

      const response = await GET(request);

      expect(response.status).toBe(401);
      expect(mockCleanup).not.toHaveBeenCalled();
    });
  });

  describe('Success Response', () => {
    it('returns cleanup result on success', async () => {
      process.env.CRON_SECRET = 'my-secret';

      const cleanupResult: CleanupUnverifiedUsersResult = {
        cutoff: new Date('2024-01-01T00:00:00Z'),
        candidates: 10,
        deleted: 10,
      };

      mockCleanup.mockResolvedValueOnce(cleanupResult);

      const request = new Request('http://localhost/api/cron/cleanup-unverified-users', {
        headers: {
          authorization: 'Bearer my-secret',
        },
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.candidates).toBe(10);
      expect(body.deleted).toBe(10);
    });
  });

  describe('Error Handling', () => {
    it('returns 500 on cleanup failure', async () => {
      process.env.CRON_SECRET = 'my-secret';

      mockCleanup.mockRejectedValueOnce(new Error('Database connection failed'));

      const request = new Request('http://localhost/api/cron/cleanup-unverified-users', {
        headers: {
          authorization: 'Bearer my-secret',
        },
      });

      const response = await GET(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: 'Cleanup failed' });
    });
  });
});
