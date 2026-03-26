'use client';

import { IconButton } from '@/components/ui/icon-button';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { PanelRightClose } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { useNavDrawer } from './nav-drawer-context';
import type { NavigationDrawerContentProps } from './types';

const NavigationDrawerContent = dynamic<NavigationDrawerContentProps>(() =>
  import('./nav-drawer').then((mod) => mod.NavigationDrawerContent),
);

interface NavDrawerTriggerProps {
  user?: NavigationDrawerContentProps['user'];
  isPro?: NavigationDrawerContentProps['isPro'];
  items: NavigationDrawerContentProps['items'];
}

export function NavDrawerTrigger({ user, isPro, items }: NavDrawerTriggerProps) {
  const { open, setOpen } = useNavDrawer();
  const tNav = useTranslations('navigation');

  return (
    <div className="md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <IconButton
            label={open ? tNav('collapseMenu') : tNav('expandMenu')}
            variant="ghost"
            size="icon"
            className="-ml-1 rounded-full border border-border/55 bg-background/80 p-1.5 shadow-sm"
          >
            <PanelRightClose size={22} />
          </IconButton>
        </SheetTrigger>
        <Suspense fallback={null}>
          <NavigationDrawerContent user={user} isPro={isPro} items={items} />
        </Suspense>
      </Sheet>
    </div>
  );
}
