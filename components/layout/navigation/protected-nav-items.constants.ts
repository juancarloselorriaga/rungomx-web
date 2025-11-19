export const protectedNavItems = [
  {
    href: '/dashboard',
    labelKey: 'dashboard' as const,
    iconName: 'LayoutDashboard' as const,
  },
  {
    href: '/team',
    labelKey: 'team' as const,
    iconName: 'Users' as const,
  },
  {
    href: '/settings',
    labelKey: 'settings' as const,
    iconName: 'Settings' as const,
  },
  {
    href: '/profile',
    labelKey: 'profile' as const,
    iconName: 'User' as const,
  },
] as const;
