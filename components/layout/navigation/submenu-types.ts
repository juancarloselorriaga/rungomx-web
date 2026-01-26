import type { ComponentType } from 'react';

/**
 * Shared types for submenu navigation components.
 * These types are used by both the sliding sidebar and submenu navigation components.
 */

/**
 * Footer link configuration for submenu panels
 */
export type SubmenuFooterLink = {
  label: string;
  href: string | { pathname: string; params: Record<string, string> };
  icon: string;
  external?: boolean;
};

/**
 * Navigation section within a submenu
 */
export type SubmenuNavigationSection = {
  titleKey: string;
  items: SubmenuNavigationItem[];
};

/**
 * Individual navigation item within a submenu section
 */
export type SubmenuNavigationItem = {
  label: string;
  href: string;
  icon: string;
  pathname?: string; // For exact pathname matching
};

/**
 * Configuration for detecting and handling a submenu based on URL patterns.
 * The urlPattern should NOT include locale prefix - it will be stripped before matching.
 */
export type SubmenuConfig = {
  /** Unique identifier for this submenu (e.g., 'event-detail') */
  id: string;
  /** Which root item triggers this submenu (e.g., '/dashboard/events') */
  parentItemHref: string;
  /** Pattern WITHOUT locale prefix, applied after stripping locale */
  urlPattern: RegExp;
  /** Extract route params from the pathname (without locale prefix) */
  extractParams: (pathname: string) => Record<string, string> | null;
};

/**
 * Context data for the currently active submenu
 */
export type SubmenuContext = {
  /** The submenu configuration id */
  id: string;
  /** Display title for the submenu header */
  title: string;
  /** Optional subtitle (e.g., organization name) */
  subtitle?: string;
  /** Route params extracted from URL */
  params: Record<string, string>;
  /** Base path for resolving submenu item links */
  basePath: string;
  /** Optional footer link (e.g., view public page) */
  footerLink?: SubmenuFooterLink | null;
};

/**
 * Icon map type for submenu navigation icons
 */
export type SubmenuIconMap = Record<string, ComponentType<{ className?: string }>>;
