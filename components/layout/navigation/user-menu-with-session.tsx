'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/auth/client';
import { useSyncExternalStore } from 'react';
import { UserMenu } from './user-menu';

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function UserMenuWithSession() {
  const { data, isPending } = useSession();
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
  const user = data?.user ?? null;

  // Show skeleton until mounted (avoids SSR/client mismatch) and while session loads
  if (!mounted || isPending) {
    return <Skeleton className="h-10 w-10 rounded-full" />;
  }

  return <UserMenu user={user} />;
}
