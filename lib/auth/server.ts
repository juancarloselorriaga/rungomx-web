import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { cache } from 'react';

export const getCurrentUser = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
});

export const getSession = cache(async () => {
  return await auth.api.getSession({
    headers: await headers(),
  });
});
