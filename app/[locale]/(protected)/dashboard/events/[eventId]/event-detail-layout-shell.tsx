'use client';

import { SubmenuContextProvider } from '@/components/layout/navigation/submenu-context-provider';
import { useSlidingNavOptional } from '@/components/layout/navigation/sliding-nav-context';
import type { SubmenuFooterLink } from '@/components/layout/navigation/submenu-types';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, useLayoutEffect } from 'react';

type EventDetailLayoutShellProps = {
  title: string;
  subtitle?: string;
  metaBadge: {
    label: string;
    tone: 'draft' | 'published' | 'unlisted' | 'archived';
  } | null;
  params: Record<string, string>;
  basePath: string;
  footerLink?: SubmenuFooterLink | SubmenuFooterLink[] | null;
  children: ReactNode;
};

const visibilityStyles = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  unlisted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  archived: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
} as const;

export function EventDetailLayoutShell({
  title,
  subtitle,
  metaBadge,
  params,
  basePath,
  footerLink,
  children,
}: EventDetailLayoutShellProps) {
  const searchParams = useSearchParams();
  const wizardMode = searchParams.get('wizard') === '1';
  const slidingNav = useSlidingNavOptional();

  // Hide the sidebar when in wizard mode, restore on exit.
  // useLayoutEffect fires before paint to prevent the sidebar from flashing visible.
  useLayoutEffect(() => {
    if (!slidingNav) return;
    if (wizardMode) {
      slidingNav.setSidebarHidden(true);
      return () => slidingNav.setSidebarHidden(false);
    }
  }, [wizardMode, slidingNav]);

  const content = (
    <>
      {!wizardMode ? (
        <div className="mb-6 rounded-2xl border border-border/60 bg-background/90 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                {metaBadge ? (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      visibilityStyles[metaBadge.tone] ?? visibilityStyles.draft
                    }`}
                  >
                    {metaBadge.label}
                  </span>
                ) : null}
              </div>
              {subtitle ? (
                <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {children}
    </>
  );

  if (wizardMode) {
    return content;
  }

  return (
    <SubmenuContextProvider
      submenuId="event-detail"
      title={title}
      subtitle={subtitle}
      metaBadge={metaBadge}
      params={params}
      basePath={basePath}
      footerLink={footerLink}
    >
      {content}
    </SubmenuContextProvider>
  );
}
