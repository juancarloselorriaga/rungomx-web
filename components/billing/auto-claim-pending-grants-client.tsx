'use client';

import { autoClaimPendingGrantsAction } from '@/app/actions/billing';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

type AutoClaimPendingGrantsClientProps = {
  enabled: boolean;
};

export function AutoClaimPendingGrantsClient({ enabled }: AutoClaimPendingGrantsClientProps) {
  const router = useRouter();
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    void (async () => {
      const result = await autoClaimPendingGrantsAction();
      if (!result.ok) return;
      if (result.data.claimedCount <= 0) return;
      router.refresh();
    })();
  }, [enabled, router]);

  return null;
}

