export const protectedNavItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    iconName: 'LayoutDashboard' as const,
  },
  {
    href: '/team',
    label: 'Team',
    iconName: 'Users' as const,
  },
  {
    href: '/settings',
    label: 'Settings',
    iconName: 'Settings' as const,
  },
  {
    href: '/profile',
    label: 'Profile',
    iconName: 'User' as const,
  },
] as const;
