'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

const TAB_TO_ANCHOR_MAP: Record<string, string> = {
  overview: 'overview',
  distances: 'distances',
  faq: 'faq',
  policies: 'policies',
  website: 'photos', // website tab content now shows as photos, course, schedule sections
};

export function TabToAnchorRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TAB_TO_ANCHOR_MAP[tab]) {
      const anchor = TAB_TO_ANCHOR_MAP[tab];
      // Remove the tab query param and add anchor
      const newUrl = `${pathname}#${anchor}`;
      router.replace(newUrl, { scroll: false });

      // Scroll to the anchor after a short delay to allow the DOM to settle
      setTimeout(() => {
        const element = document.getElementById(anchor);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  }, [searchParams, router, pathname]);

  return null;
}
