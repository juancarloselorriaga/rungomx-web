'use client';

import { cn } from '@/lib/utils';
import {
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';

type NavDrawerContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const NavDrawerContext = createContext<NavDrawerContextValue | undefined>(undefined);

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const value = useMemo(
    () => ({
      open,
      setOpen,
    }),
    [open],
  );

  return <NavDrawerContext.Provider value={value}>{children}</NavDrawerContext.Provider>;
}

export function useNavDrawer(): NavDrawerContextValue {
  const context = useContext(NavDrawerContext);

  if (!context) {
    throw new Error('useNavDrawer must be used within a NavDrawerProvider');
  }

  return context;
}

type MobileNavPushLayoutProps = HTMLAttributes<HTMLDivElement>;

export function MobileNavPushLayout({ className, ...props }: MobileNavPushLayoutProps) {
  const { open } = useNavDrawer();

  return (
    <div
      data-nav-drawer-open={open ? 'true' : 'false'}
      className={cn('mobile-nav-push-layout', open && 'mobile-nav-push-layout-open', className)}
      {...props}
    />
  );
}
