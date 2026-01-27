'use client';

import { usePathname } from '@/i18n/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SubmenuConfig, SubmenuContext } from './submenu-types';

/**
 * Sliding Navigation Context
 *
 * Manages the state for a 2-level sliding sidebar navigation:
 * - Level 1 (root): Main navigation items (Dashboard, Events, etc.)
 * - Level 2 (submenu): Detail navigation (e.g., event detail sections)
 *
 * Key behaviors:
 * - URL-based auto-detection: When URL matches a submenu pattern, show that submenu
 * - Manual override: User can click "Back" to show root menu without changing URL
 * - Re-entry: User can click chevron to re-enter submenu after using "Back"
 */

type DisplayLevel = 'root' | 'submenu';

type SlidingNavContextValue = {
  /** Current display level ('root' or 'submenu') */
  displayLevel: DisplayLevel;

  /** URL-detected submenu ID (what the URL says we should show) */
  detectedSubmenuId: string | null;

  /** Manual override active (user clicked "Back" but is still on submenu URL) */
  manualRootOverride: boolean;

  /** Submenu context for header display and link resolution */
  submenuContext: SubmenuContext | null;

  /** Set manual override to show root menu without navigation */
  goToRoot: () => void;

  /** Clear manual override to re-enter detected submenu */
  enterSubmenu: () => void;

  /** Set the submenu context (called by SubmenuContextProvider in layouts) */
  setSubmenuContext: (ctx: SubmenuContext | null) => void;

  /** Get submenu config for a given href (used by NavLink to show chevrons) */
  getSubmenuForHref: (href: string) => SubmenuConfig | null;

  /** All registered submenu configurations */
  submenuConfigs: SubmenuConfig[];
};

const SlidingNavContext = createContext<SlidingNavContextValue | null>(null);

type SlidingNavProviderProps = {
  children: ReactNode;
  /** Submenu configurations to register */
  configs?: SubmenuConfig[];
};

/**
 * Default submenu configurations
 * Add new submenus here as they're implemented
 */
const defaultSubmenuConfigs: SubmenuConfig[] = [
  {
    id: 'event-detail',
    parentItemHref: '/dashboard/events',
    urlPattern: /^\/dashboard\/events\/([^/]+)/,
    extractParams: (pathname) => {
      const match = pathname.match(/^\/dashboard\/events\/([^/]+)/);
      return match ? { eventId: match[1] } : null;
    },
  },
  // Future: Add organization settings, etc.
];

export function SlidingNavProvider({
  children,
  configs = defaultSubmenuConfigs,
}: SlidingNavProviderProps) {
  const pathname = usePathname(); // Already locale-stripped
  const [manualRootOverride, setManualRootOverride] = useState(false);
  const [submenuContext, setSubmenuContextInternal] = useState<SubmenuContext | null>(null);

  // Detect which submenu (if any) matches the current URL
  const detectedSubmenuId = useMemo(() => {
    for (const config of configs) {
      if (config.urlPattern.test(pathname)) {
        return config.id;
      }
    }
    return null;
  }, [pathname, configs]);

  const setSubmenuContext = useCallback(
    (ctx: SubmenuContext | null) => {
      setSubmenuContextInternal((prev) => {
        const prevId = prev?.id ?? null;
        const nextId = ctx?.id ?? null;

        if (prevId !== nextId) {
          setManualRootOverride(false);
        }

        return ctx;
      });
    },
    [],
  );

  // Compute current display level
  // If manual override is active, show root even when URL matches a submenu
  const displayLevel: DisplayLevel = useMemo(() => {
    if (manualRootOverride) return 'root';
    if (detectedSubmenuId) return 'submenu';
    return 'root';
  }, [manualRootOverride, detectedSubmenuId]);

  const goToRoot = useCallback(() => {
    if (!detectedSubmenuId) return;
    setManualRootOverride(true);
  }, [detectedSubmenuId]);

  const enterSubmenu = useCallback(() => {
    setManualRootOverride(false);
  }, []);

  const getSubmenuForHref = useCallback(
    (href: string): SubmenuConfig | null => {
      // Find a config where this href is the parent that triggers the submenu
      return configs.find((config) => config.parentItemHref === href) ?? null;
    },
    [configs],
  );

  const value = useMemo(
    (): SlidingNavContextValue => ({
      displayLevel,
      detectedSubmenuId,
      manualRootOverride,
      submenuContext,
      goToRoot,
      enterSubmenu,
      setSubmenuContext,
      getSubmenuForHref,
      submenuConfigs: configs,
    }),
    [
      displayLevel,
      detectedSubmenuId,
      manualRootOverride,
      submenuContext,
      goToRoot,
      enterSubmenu,
      setSubmenuContext,
      getSubmenuForHref,
      configs,
    ],
  );

  return <SlidingNavContext.Provider value={value}>{children}</SlidingNavContext.Provider>;
}

/**
 * Hook to access sliding nav context.
 * Throws if used outside of SlidingNavProvider.
 */
export function useSlidingNav(): SlidingNavContextValue {
  const context = useContext(SlidingNavContext);
  if (!context) {
    throw new Error('useSlidingNav must be used within a SlidingNavProvider');
  }
  return context;
}

/**
 * Hook to optionally access sliding nav context.
 * Returns null if used outside of SlidingNavProvider.
 * Useful for components that work both with and without the provider (e.g., NavLink).
 */
export function useSlidingNavOptional(): SlidingNavContextValue | null {
  return useContext(SlidingNavContext);
}
