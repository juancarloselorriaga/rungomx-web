import type { User } from '@/types/auth';
import { cache } from 'react';

export const getCurrentUser = cache(async (): Promise<User | null> => {
  return null;
});

