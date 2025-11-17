import { cache } from 'react';

import type { User } from '@/types/auth';

export const getCurrentUser = cache(async (): Promise<User | null> => {
  return null;
});

