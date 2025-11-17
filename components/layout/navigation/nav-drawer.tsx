'use client';

import AuthControlsCompact from '@/components/auth/auth-controls-compact';
import { NavItems } from '@/components/layout/navigation/nav-items';
import type { NavigationDrawerContentProps } from '@/components/layout/navigation/types';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { PanelRightOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

export function NavigationDrawerContent({
  user,
  items
}: NavigationDrawerContentProps) {
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (closeButtonRef.current) {
      closeButtonRef.current.click();
    }
  }, [pathname]);

  return (
    <SheetContent side="left" hideCloseButton className="w-[80%] max-w-sm border-r p-0">
      <div className="flex flex-col h-full">
        <SheetHeader className="p-1 py-2 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle asChild>
              <Link className="px-4" href="/">
                SprintMX
              </Link>
            </SheetTitle>
            <SheetPrimitive.Close asChild ref={closeButtonRef}>
              <Button variant="ghost" size="icon" className="p-0 rounded-sm h-8 w-8">
                <PanelRightOpen size={20}/>
                <span className="sr-only">Close</span>
              </Button>
            </SheetPrimitive.Close>
          </div>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto">
          <NavItems items={items}/>
        </nav>

        <div className="mt-auto border-t p-4">
          <div className="flex w-full items-center justify-between">
            <AuthControlsCompact initialUser={user}/>
            <Suspense fallback={null}>
              <ThemeSwitcher/>
            </Suspense>
          </div>
        </div>
      </div>
    </SheetContent>
  );
}
