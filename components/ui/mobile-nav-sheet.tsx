'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createContext, type ReactNode, useContext, useState } from 'react';

type MobileNavSheetContextValue = {
  close: () => void;
};

const MobileNavSheetContext = createContext<MobileNavSheetContextValue | null>(null);

export function useMobileNavSheet() {
  return useContext(MobileNavSheetContext);
}

type MobileNavSheetProps = {
  label: string;
  value: string;
  title?: string;
  closeLabel: string;
  children: ReactNode;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
};

function MobileNavSheetInner({
  label,
  value,
  title,
  closeLabel,
  children,
  className,
  triggerClassName,
  contentClassName,
}: MobileNavSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('w-full', className)}>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'w-full justify-between gap-3 rounded-xl px-4 py-3 h-auto',
              'bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60',
              'shadow-sm',
              'data-[state=open]:shadow-md data-[state=open]:border-border',
              'group/mobile-nav-trigger',
              triggerClassName,
            )}
            aria-label={`${label}: ${value}`}
          >
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <span className="block truncate text-base font-semibold">{value}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]/mobile-nav-trigger:rotate-180" />
          </Button>
        </SheetTrigger>

        <SheetContent
          side="bottom"
          hideCloseButton
          className={cn(
            'gap-0',
            'p-0 rounded-t-2xl max-h-[85dvh] overflow-hidden',
            'shadow-2xl',
            contentClassName,
          )}
        >
          <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted" />

          <SheetHeader className="px-4 pb-2 pt-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <SheetTitle className="text-base">{title ?? label}</SheetTitle>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{value}</p>
              </div>
              <SheetClose asChild>
                <Button type="button" variant="ghost" size="sm" className="-mr-2">
                  {closeLabel}
                </Button>
              </SheetClose>
            </div>
          </SheetHeader>

          <MobileNavSheetContext.Provider value={{ close: () => setOpen(false) }}>
            <div className="overflow-y-auto px-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {children}
            </div>
          </MobileNavSheetContext.Provider>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function MobileNavSheet(props: MobileNavSheetProps) {
  const pathname = usePathname();
  return <MobileNavSheetInner key={pathname} {...props} />;
}
