'use client';

import { Button } from '@/components/ui/button';
import { MobileNavSheet, useMobileNavSheet } from '@/components/ui/mobile-nav-sheet';
import { Link } from '@/i18n/navigation';
import {
  DEFAULT_MY_REGISTRATIONS_VIEW,
  MY_REGISTRATIONS_VIEWS,
  parseMyRegistrationsView,
  type MyRegistrationsView,
} from '@/lib/events/my-registrations/view';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { ComponentProps } from 'react';

function getHref(view: MyRegistrationsView) {
  if (view === DEFAULT_MY_REGISTRATIONS_VIEW) {
    return '/dashboard/my-registrations';
  }
  return `/dashboard/my-registrations?view=${view}`;
}

type MobileViewListProps = {
  activeView: MyRegistrationsView;
  labels: Record<MyRegistrationsView, { full: string; short: string }>;
};

function MobileViewList({ activeView, labels }: MobileViewListProps) {
  const mobileNavSheet = useMobileNavSheet();
  type LinkHref = ComponentProps<typeof Link>['href'];

  return (
    <div className="py-2">
      <div className="space-y-1">
        {MY_REGISTRATIONS_VIEWS.map((view) => {
          const isActive = activeView === view;
          const href = getHref(view) as LinkHref;
          return (
            <Button
              key={view}
              asChild
              variant={isActive ? 'secondary' : 'ghost'}
              className={cn(
                'h-auto w-full justify-start px-3 py-3',
                isActive ? 'shadow-sm' : 'text-muted-foreground',
              )}
            >
              <Link
                href={href}
                scroll={false}
                replace={isActive}
                onClick={() => mobileNavSheet?.close()}
                className="flex w-full items-center justify-between gap-3"
              >
                <span className="text-sm font-semibold leading-tight">{labels[view].full}</span>
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function MyRegistrationsSubnav() {
  const t = useTranslations('pages.dashboard.myRegistrations');
  const tCommon = useTranslations('common');
  const searchParams = useSearchParams();
  const activeView = parseMyRegistrationsView(searchParams?.get('view'));
  type LinkHref = ComponentProps<typeof Link>['href'];

  const labels: Record<MyRegistrationsView, { full: string; short: string }> = {
    upcoming: {
      full: t('tabs.upcoming'),
      short: t('tabs.upcomingShort'),
    },
    in_progress: {
      full: t('tabs.inProgress'),
      short: t('tabs.inProgressShort'),
    },
    past: {
      full: t('tabs.past'),
      short: t('tabs.pastShort'),
    },
    cancelled: {
      full: t('tabs.cancelled'),
      short: t('tabs.cancelledShort'),
    },
  };

  return (
    <>
      <div className="md:hidden">
        <MobileNavSheet
          label={t('tabs.menu')}
          value={labels[activeView].full}
          title={t('tabs.menu')}
          closeLabel={tCommon('close')}
        >
          <MobileViewList activeView={activeView} labels={labels} />
        </MobileNavSheet>
      </div>

      <div className="hidden md:flex items-stretch gap-1 rounded-lg border bg-background/60 p-1">
        {MY_REGISTRATIONS_VIEWS.map((view) => {
          const isActive = activeView === view;
          const href = getHref(view) as LinkHref;
          return (
            <Button
              key={view}
              asChild
              variant={isActive ? 'secondary' : 'ghost'}
              size="sm"
              className={cn(
                'h-auto min-w-0 flex-1 items-center justify-center gap-2 px-3 py-2 text-center',
                '!shrink overflow-hidden',
                isActive ? 'shadow-sm' : 'text-muted-foreground',
              )}
            >
              <Link
                href={href}
                scroll={false}
                replace={isActive}
                className="flex min-w-0 w-full items-center justify-center overflow-hidden"
              >
                <span className="inline text-sm font-semibold leading-tight lg:hidden">
                  {labels[view].short}
                </span>
                <span className="hidden text-sm font-semibold leading-tight lg:inline">
                  {labels[view].full}
                </span>
              </Link>
            </Button>
          );
        })}
      </div>
    </>
  );
}
