'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';

type SidebarBackHeaderProps = {
  /** Title to display next to the back button */
  title: string;
  /** Optional subtitle (e.g., organization name) */
  subtitle?: string;
  /** Click handler for back navigation (does not navigate, just changes display) */
  onClick: () => void;
  /** Optional className for the container */
  className?: string;
  /** Variant for different display contexts */
  variant?: 'sidebar' | 'drawer';
};

/**
 * Back header for submenu panels in the sliding sidebar.
 * Shows a back button with chevron, title, and optional subtitle.
 * Clicking does not navigate - it only changes the sidebar display to root menu.
 */
export function SidebarBackHeader({
  title,
  subtitle,
  onClick,
  className,
  variant = 'sidebar',
}: SidebarBackHeaderProps) {
  return (
    <div
      className={cn(
        'border-b',
        variant === 'drawer' ? 'px-2 py-3' : 'px-2 py-3',
        className,
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        className="nav-chevron-back group -ml-1 flex h-auto w-full items-center justify-start gap-2 px-2 py-2 text-left hover:bg-accent"
        aria-label="Go back to main menu"
      >
        <ChevronLeft
          className="nav-chevron h-4 w-4 flex-shrink-0 text-muted-foreground group-hover:text-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          {subtitle && (
            <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
          )}
        </div>
      </Button>
    </div>
  );
}
