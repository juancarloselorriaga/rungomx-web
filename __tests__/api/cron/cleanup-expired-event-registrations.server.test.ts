const mockCleanup = jest.fn<Promise<number>, []>();

jest.mock('@/lib/events/cleanup-expired-registrations', () => ({
  cleanupExpiredRegistrations: () => mockCleanup(),
}));

import { GET } from '@/app/api/cron/cleanup-expired-event-registrations/route';

// Helper to set NODE_ENV without TypeScript readonly error
const setNodeEnv = (value: string) => {
  (process.env as { NODE_ENV: string }).NODE_ENV = value;
};

describe('Cron Route Handler - cleanup-expired-event-registrations', () => {
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

      const request = new Request('http://localhost/api/cron/cleanup-expired-event-registrations');

      const response = await GET(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ error: 'Unauthorized' });
      expect(mockCleanup).not.toHaveBeenCalled();
    });

    it('returns 401 with invalid Bearer token', async () => {
      process.env.CRON_SECRET = 'my-secret';
      setNodeEnv('production');

      const request = new Request('http://localhost/api/cron/cleanup-expired-event-registrations', {
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

      mockCleanup.mockResolvedValueOnce(5);

      const request = new Request('http://localhost/api/cron/cleanup-expired-event-registrations', {
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

      mockCleanup.mockResolvedValueOnce(0);

      const request = new Request('http://localhost/api/cron/cleanup-expired-event-registrations', {
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

      const request = new Request('http://localhost/api/cron/cleanup-expired-event-registrations', {
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

      mockCleanup.mockResolvedValueOnce(10);

      const request = new Request('http://localhost/api/cron/cleanup-expired-event-registrations', {
        headers: {
          authorization: 'Bearer my-secret',
        },
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ success: true, cancelledCount: 10 });
    });
  });

  describe('Error Handling', () => {
    it('returns 500 on cleanup failure', async () => {
      process.env.CRON_SECRET = 'my-secret';

      mockCleanup.mockRejectedValueOnce(new Error('Database connection failed'));

      const request = new Request('http://localhost/api/cron/cleanup-expired-event-registrations', {
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
