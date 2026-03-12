'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const ASSISTANT_QUERY_PARAM = 'assistant';

export function useAssistantWorkspaceQueryState() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isOpen = searchParams.get(ASSISTANT_QUERY_PARAM) === '1';

  const setOpen = useCallback(
    (open: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (open) {
        params.set(ASSISTANT_QUERY_PARAM, '1');
      } else {
        params.delete(ASSISTANT_QUERY_PARAM);
      }

      const nextQuery = params.toString();
      const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      router.push(nextHref, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return {
    isOpen,
    setOpen,
  };
}
