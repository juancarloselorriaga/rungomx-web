import {
  confirmProfilePictureUpload,
  deleteExistingPictureAction,
  deleteProfilePictureAction,
} from '@/app/actions/profile-picture';
import * as dbModule from '@/db';
import { headers } from 'next/headers';

type MockAuthContext = { user: { id: string; image: string | null }; isInternal: boolean };

type UpdateCall = { table: unknown; values: unknown; condition: unknown };

type MockDbModule = {
  db: { update: jest.Mock };
  __getUpdateCalls: () => UpdateCall[];
  __reset: () => void;
  __setUpdateError: (error: Error | null) => void;
};

const mockRequireAuth = jest.fn<Promise<MockAuthContext>, unknown[]>();
const mockGetSession = jest.fn<Promise<void>, unknown[]>();
const mockBlobDel = jest.fn<Promise<void>, unknown[]>();
const eqMock = jest.fn((...args: unknown[]) => ({ type: 'eq', args }));

jest.mock('@/lib/auth/guards', () => ({
  requireAuthenticatedUser: (...args: unknown[]) => mockRequireAuth(...args),
}));

jest.mock('@vercel/blob', () => ({
  del: (...args: unknown[]) => mockBlobDel(...args),
}));

jest.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => eqMock(...args),
}));

jest.mock('@/db', () => {
  const state = {
    updateCalls: [] as UpdateCall[],
    error: null as Error | null,
  };

  const update = jest.fn((table: unknown) => ({
    set: jest.fn((values: unknown) => ({
      where: jest.fn(async (condition: unknown) => {
        if (state.error) throw state.error;
        state.updateCalls.push({ table, values, condition });
        return undefined;
      }),
    })),
  }));

  const __reset = () => {
    state.updateCalls = [];
    state.error = null;
    update.mockClear();
  };

  const __setUpdateError = (error: Error | null) => {
    state.error = error;
  };

  return {
    db: { update },
    __getUpdateCalls: () => state.updateCalls,
    __reset,
    __setUpdateError,
  };
});

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
}));

jest.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

const { __getUpdateCalls, __reset, __setUpdateError } = dbModule as unknown as MockDbModule;
const mockHeaders = headers as jest.MockedFunction<typeof headers>;

describe('confirmProfilePictureUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __reset();
    mockRequireAuth.mockResolvedValue({
      user: { id: 'user-123', image: null },
      isInternal: false,
    });
    mockGetSession.mockResolvedValue(undefined);
    mockHeaders.mockResolvedValue(new Headers());
  });

  it('successfully confirms profile picture upload', async () => {
    const imageUrl = 'https://blob.vercel-storage.com/test-image.webp';

    const result = await confirmProfilePictureUpload(imageUrl);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.imageUrl).toBe(imageUrl);
    }

    const updateCalls = __getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toEqual({ image: imageUrl });
  });

  it('rejects upload for internal users', async () => {
    mockRequireAuth.mockResolvedValue({
      user: { id: 'user-123', image: null },
      isInternal: true,
    });

    const result = await confirmProfilePictureUpload('https://blob.vercel-storage.com/test.webp');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('FORBIDDEN');
    }
  });

  it('rejects invalid image URLs', async () => {
    const result = await confirmProfilePictureUpload('https://example.com/invalid.jpg');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_INPUT');
    }
  });

  it('refreshes session after successful upload', async () => {
    await confirmProfilePictureUpload('https://blob.vercel-storage.com/test.webp');

    expect(mockGetSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true },
    });
  });

  it('handles database errors gracefully', async () => {
    __setUpdateError(new Error('Database connection failed'));

    const result = await confirmProfilePictureUpload('https://blob.vercel-storage.com/test.webp');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('SERVER_ERROR');
    }
  });
});

describe('deleteProfilePictureAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __reset();
    mockRequireAuth.mockResolvedValue({
      user: { id: 'user-123', image: 'https://blob.vercel-storage.com/existing.webp' },
      isInternal: false,
    });
    mockGetSession.mockResolvedValue(undefined);
    mockBlobDel.mockResolvedValue(undefined);
    mockHeaders.mockResolvedValue(new Headers());
  });

  it('successfully deletes profile picture', async () => {
    const result = await deleteProfilePictureAction();

    expect(result.ok).toBe(true);
    expect(mockBlobDel).toHaveBeenCalledWith('https://blob.vercel-storage.com/existing.webp');

    const updateCalls = __getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toEqual({ image: null });
  });

  it('handles case where no image exists', async () => {
    mockRequireAuth.mockResolvedValue({
      user: { id: 'user-123', image: null },
      isInternal: false,
    });

    const result = await deleteProfilePictureAction();

    expect(result.ok).toBe(true);
    expect(mockBlobDel).not.toHaveBeenCalled();
  });

  it('rejects deletion for internal users', async () => {
    mockRequireAuth.mockResolvedValue({
      user: { id: 'user-123', image: 'https://blob.vercel-storage.com/existing.webp' },
      isInternal: true,
    });

    const result = await deleteProfilePictureAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('FORBIDDEN');
    }
  });

  it('continues even if blob deletion fails', async () => {
    mockBlobDel.mockRejectedValue(new Error('Blob not found'));

    const result = await deleteProfilePictureAction();

    expect(result.ok).toBe(true);
    const updateCalls = __getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
  });

  it('refreshes session after successful deletion', async () => {
    await deleteProfilePictureAction();

    expect(mockGetSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true },
    });
  });
});

describe('deleteExistingPictureAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __reset();
    mockRequireAuth.mockResolvedValue({
      user: { id: 'user-123', image: 'https://blob.vercel-storage.com/existing.webp' },
      isInternal: false,
    });
    mockBlobDel.mockResolvedValue(undefined);
  });

  it('successfully deletes existing picture from blob', async () => {
    const result = await deleteExistingPictureAction();

    expect(result.ok).toBe(true);
    expect(mockBlobDel).toHaveBeenCalledWith('https://blob.vercel-storage.com/existing.webp');
  });

  it('does not delete if no image exists', async () => {
    mockRequireAuth.mockResolvedValue({
      user: { id: 'user-123', image: null },
      isInternal: false,
    });

    const result = await deleteExistingPictureAction();

    expect(result.ok).toBe(true);
    expect(mockBlobDel).not.toHaveBeenCalled();
  });

  it('rejects for internal users', async () => {
    mockRequireAuth.mockResolvedValue({
      user: { id: 'user-123', image: 'https://blob.vercel-storage.com/existing.webp' },
      isInternal: true,
    });

    const result = await deleteExistingPictureAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('FORBIDDEN');
    }
  });
});
