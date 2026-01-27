'use client';

import { useEffect, type ReactNode } from 'react';
import { useSlidingNavOptional } from './sliding-nav-context';
import type { SubmenuContext, SubmenuFooterLink } from './submenu-types';

type SubmenuContextProviderProps = {
  /** Submenu configuration id (e.g., 'event-detail') */
  submenuId: string;
  /** Display title for the submenu header */
  title: string;
  /** Optional subtitle (e.g., organization name) */
  subtitle?: string;
  /** Optional badge displayed under the title (e.g., visibility status) */
  metaBadge?: {
    label: string;
    tone: 'draft' | 'published' | 'unlisted' | 'archived';
  } | null;
  /** Route params extracted from URL */
  params: Record<string, string>;
  /** Base path for resolving submenu item links */
  basePath: string;
  /** Optional footer link (e.g., view public page) */
  footerLink?: SubmenuFooterLink | null;
  children: ReactNode;
};

/**
 * SubmenuContextProvider is a client component that sets the submenu context
 * when mounted inside a layout that should show submenu navigation.
 *
 * It passes submenu data (title, subtitle, basePath, footerLink) from server
 * components (layouts) to the sliding navigation context.
 *
 * Usage in layouts:
 * ```tsx
 * <SubmenuContextProvider
 *   submenuId="event-detail"
 *   title={`${event.seriesName} ${event.editionLabel}`}
 *   subtitle={event.organizationName}
 *   params={{ eventId }}
 *   basePath={`/dashboard/events/${eventId}`}
 *   footerLink={...}
 * >
 *   {children}
 * </SubmenuContextProvider>
 * ```
 */
export function SubmenuContextProvider({
  submenuId,
  title,
  subtitle,
  metaBadge = null,
  params,
  basePath,
  footerLink,
  children,
}: SubmenuContextProviderProps) {
  const slidingNav = useSlidingNavOptional();
  const setSubmenuContext = slidingNav?.setSubmenuContext;

  // Serialize objects to stable strings for dependency comparison
  const paramsKey = JSON.stringify(params);
  const footerLinkKey = JSON.stringify(footerLink);
  const metaBadgeKey = JSON.stringify(metaBadge);

  useEffect(() => {
    if (!setSubmenuContext) return;

    const context: SubmenuContext = {
      id: submenuId,
      title,
      subtitle,
      metaBadge: metaBadgeKey ? JSON.parse(metaBadgeKey) : null,
      params: JSON.parse(paramsKey),
      basePath,
      footerLink: footerLinkKey ? JSON.parse(footerLinkKey) : null,
    };

    setSubmenuContext(context);

    // Clear context when unmounting
    return () => {
      setSubmenuContext(null);
    };
  }, [setSubmenuContext, submenuId, title, subtitle, metaBadgeKey, paramsKey, basePath, footerLinkKey]);

  return <>{children}</>;
}
