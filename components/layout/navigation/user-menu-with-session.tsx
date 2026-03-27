'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/auth/client';
import { useEffect, useState } from 'react';
import { UserMenu } from './user-menu';

export function UserMenuWithSession() {
  const { data, isPending } = useSession();
  const [mounted, setMounted] = useState(false);
  const user = data?.user ?? null;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show skeleton until mounted (avoids SSR/client mismatch) and while session loads
  if (!mounted || isPending) {
    return <Skeleton className="h-10 w-10 rounded-full" />;
  }

  return <UserMenu user={user} />;
}
