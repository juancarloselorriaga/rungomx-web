'use client';

import { useSession } from '@/lib/auth/client';
import type { User } from '@/lib/auth/types';
import { UserMenu } from './user-menu';

interface UserMenuWithSessionProps {
  initialUser?: User | null;
}

export function UserMenuWithSession({ initialUser }: UserMenuWithSessionProps) {
  const { data, isPending } = useSession();

  // Use server state during hydration, then client state for real-time updates
  const user = isPending ? (initialUser ?? null) : (data?.user ?? null);

  return <UserMenu user={user} />;
}
