import { User } from '@/types/auth';

export interface NavItem {
  href: string;
  label: string;
  iconName: string;
}

export interface NavigationDrawerContentProps {
  user: User | null;
  items: readonly NavItem[];
}
