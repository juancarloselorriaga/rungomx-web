'use client';

import { useSession } from '@/lib/auth/client';
import { UserMenu } from './user-menu';

export function UserMenuWithSession() {
  const { data } = useSession();

  return <UserMenu user={data?.user ?? null} />;
}

