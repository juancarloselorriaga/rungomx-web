'use client';

import { SubmenuContextProvider } from '@/components/layout/navigation/submenu-context-provider';
import type { SubmenuFooterLink } from '@/components/layout/navigation/submenu-types';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

type EventDetailLayoutShellProps = {
  title: string;
  subtitle?: string;
  metaBadge: {
    label: string;
    tone: 'draft' | 'published' | 'unlisted' | 'archived';
  } | null;
  params: Record<string, string>;
  basePath: string;
  footerLink?: SubmenuFooterLink | null;
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

  const content = (
    <>
      {!wizardMode ? (
        <div className="mb-6 md:hidden">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                {metaBadge ? (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      visibilityStyles[metaBadge.tone] ?? visibilityStyles.draft
                    }`}
                  >
                    {metaBadge.label}
                  </span>
                ) : null}
              </div>
              {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
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
