'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/auth/client';
import { UserMenu } from './user-menu';

export function UserMenuWithSession() {
  const { data, isPending } = useSession();
  const user = data?.user ?? null;

  // Show skeleton while session is loading to avoid flash
  if (isPending) {
    return <Skeleton className="h-10 w-10 rounded-full" />;
  }

  return <UserMenu user={user} />;
}
