import type { SubmenuConfig, SubmenuIconMap, SubmenuNavigationSection } from './submenu-types';
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Crown,
  DollarSign,
  ExternalLink,
  FileText,
  Gift,
  Globe,
  HelpCircle,
  Mail,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  Users,
} from 'lucide-react';

/**
 * Submenu configurations for URL-based detection.
 * Add new submenus here as they're implemented.
 */
export const submenuConfigs: SubmenuConfig[] = [
  {
    id: 'event-detail',
    parentItemHref: '/dashboard/events',
    urlPattern: /^\/dashboard\/events\/([^/]+)/,
    extractParams: (pathname) => {
      const match = pathname.match(/^\/dashboard\/events\/([^/]+)/);
      return match ? { eventId: match[1] } : null;
    },
  },
  {
    id: 'org-detail',
    parentItemHref: '/dashboard/organizations',
    urlPattern: /^\/dashboard\/organizations\/([^/]+)/,
    extractParams: (pathname) => {
      const match = pathname.match(/^\/dashboard\/organizations\/([^/]+)/);
      return match ? { orgId: match[1] } : null;
    },
  },
  {
    id: 'admin-users',
    parentItemHref: '/admin/users',
    urlPattern: /^\/admin\/users(\/|$)/,
    extractParams: () => ({}),
  },
];

/**
 * Event detail submenu navigation sections.
 * These sections appear in the sidebar when viewing an event.
 */
export const eventNavigationSections: SubmenuNavigationSection[] = [
  {
    titleKey: 'general',
    items: [
      { label: 'overview', href: '', icon: 'overview' },
      { label: 'editions', href: '/editions', icon: 'editions' },
      { label: 'settings', href: '/settings', icon: 'settings' },
    ],
  },
  {
    titleKey: 'content',
    items: [
      { label: 'faq', href: '/faq', icon: 'faq' },
      { label: 'waivers', href: '/waivers', icon: 'waivers' },
      { label: 'questions', href: '/questions', icon: 'clipboardList' },
      { label: 'policies', href: '/policies', icon: 'policies' },
      { label: 'website', href: '/website', icon: 'website' },
    ],
  },
  {
    titleKey: 'pricing',
    items: [
      { label: 'pricing', href: '/pricing', icon: 'pricing' },
      { label: 'addOns', href: '/add-ons', icon: 'addOns' },
      { label: 'coupons', href: '/coupons', icon: 'coupons' },
    ],
  },
  {
    titleKey: 'management',
    items: [
      { label: 'groupRegistrations', href: '/group-registrations', icon: 'groupRegistrations' },
      { label: 'registrations', href: '/registrations', icon: 'registrations' },
    ],
  },
];

/**
 * Icon map for event submenu navigation.
 * Maps icon string keys to Lucide icon components.
 */
export const eventIconMap: SubmenuIconMap = {
  addOns: Gift,
  barChart3: BarChart3,
  editions: CalendarDays,
  clipboardList: ClipboardList,
  coupons: Tag,
  dollarSign: DollarSign,
  externalLink: ExternalLink,
  faq: HelpCircle,
  fileText: FileText,
  gift: Gift,
  globe: Globe,
  helpCircle: HelpCircle,
  overview: BarChart3,
  policies: ClipboardList,
  pricing: DollarSign,
  groupRegistrations: Users,
  registrations: Users,
  settings: Settings,
  tag: Tag,
  users: Users,
  waivers: FileText,
  website: Globe,
};

/**
 * Admin users submenu navigation sections.
 * These sections appear in the sidebar when working in /admin/users/*.
 */
export const adminUsersNavigationSections: SubmenuNavigationSection[] = [
  {
    titleKey: 'users',
    items: [
      { label: 'selfSignup', href: '/self-signup', icon: 'users' },
      { label: 'internal', href: '/internal', icon: 'shieldCheck' },
    ],
  },
  {
    titleKey: 'proAccess',
    items: [
      { label: 'status', href: '/pro-access', icon: 'search' },
      { label: 'overrides', href: '/pro-access/overrides', icon: 'shieldCheck' },
      { label: 'promoCodes', href: '/pro-access/promo-codes', icon: 'tag' },
      { label: 'emailGrants', href: '/pro-access/email-grants', icon: 'mail' },
    ],
  },
];

/**
 * Icon map for admin users submenu navigation.
 */
export const adminUsersIconMap: SubmenuIconMap = {
  crown: Crown,
  mail: Mail,
  search: Search,
  shieldCheck: ShieldCheck,
  tag: Tag,
  users: Users,
};
