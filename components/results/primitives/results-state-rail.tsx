import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { MutedSurface, Surface } from '@/components/ui/surface';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type {
  OrganizerResultsRailState,
  ResultsConnectivityState,
  ResultsLifecycleState,
  ResultsNextActionKey,
} from '@/lib/events/results/workspace';
import { ArrowRightCircle, CloudOff, Wifi, ShieldCheck } from 'lucide-react';

type ResultsStateRailLabels = {
  title: string;
  description: string;
  lifecycle: string;
  lifecycleDraft: string;
  lifecycleOfficial: string;
  lifecycleDraftHint: string;
  lifecycleOfficialHint: string;
  connectivity: string;
  connectivityOnline: string;
  connectivityOffline: string;
  connectivityOnlineHint: string;
  connectivityOfflineHint: string;
  unsyncedCount: string;
  nextAction: string;
  nextActionSyncPending: string;
  nextActionReviewDraft: string;
  nextActionReadyToPublish: string;
  nextActionStartIngestion: string;
};

type ResultsStateRailProps = {
  state: OrganizerResultsRailState;
  labels: ResultsStateRailLabels;
  nextActionHref?: Parameters<typeof Link>[0]['href'];
  className?: string;
  compact?: boolean;
};

const lifecycleBadgeVariant: Record<ResultsLifecycleState, 'indigo' | 'green'> = {
  draft: 'indigo',
  official: 'green',
};

const connectivityBadgeVariant: Record<ResultsConnectivityState, 'outline' | 'primary'> = {
  online: 'primary',
  offline: 'outline',
};

function getNextActionLabel(
  nextActionKey: ResultsNextActionKey,
  labels: ResultsStateRailLabels,
): string {
  switch (nextActionKey) {
    case 'syncPending':
      return labels.nextActionSyncPending;
    case 'reviewDraft':
      return labels.nextActionReviewDraft;
    case 'readyToPublish':
      return labels.nextActionReadyToPublish;
    default:
      return labels.nextActionStartIngestion;
  }
}

export function ResultsStateRail({
  state,
  labels,
  nextActionHref,
  className,
  compact = false,
}: ResultsStateRailProps) {
  const lifecycleLabel =
    state.lifecycle === 'official' ? labels.lifecycleOfficial : labels.lifecycleDraft;
  const lifecycleHint =
    state.lifecycle === 'official' ? labels.lifecycleOfficialHint : labels.lifecycleDraftHint;

  const connectivityLabel =
    state.connectivity === 'online' ? labels.connectivityOnline : labels.connectivityOffline;
  const connectivityHint =
    state.connectivity === 'online'
      ? labels.connectivityOnlineHint
      : labels.connectivityOfflineHint;
  const nextActionLabel = getNextActionLabel(state.nextActionKey, labels);

  return (
    <Surface
      as="section"
      className={cn('rounded-2xl border-border/60 p-4 shadow-none sm:p-5', className)}
      aria-live="polite"
      aria-label={labels.title}
    >
      <h2 className="text-sm font-semibold tracking-wide text-foreground sm:text-base">
        {labels.title}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{labels.description}</p>

      <dl
        className={cn(
          'mt-4 grid gap-3 sm:grid-cols-2',
          compact ? 'xl:grid-cols-2' : 'lg:grid-cols-4',
        )}
      >
        <MutedSurface
          className={cn('space-y-2 rounded-xl p-3', compact ? 'bg-muted/12' : undefined)}
        >
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.lifecycle}
          </dt>
          <dd className="mt-2 space-y-1">
            <Badge
              size="sm"
              variant={lifecycleBadgeVariant[state.lifecycle]}
              icon={<ShieldCheck className="h-3 w-3" />}
            >
              {lifecycleLabel}
            </Badge>
            <p className="text-xs text-muted-foreground">{lifecycleHint}</p>
          </dd>
        </MutedSurface>

        <MutedSurface
          className={cn('space-y-2 rounded-xl p-3', compact ? 'bg-muted/12' : undefined)}
        >
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.connectivity}
          </dt>
          <dd className="mt-2 space-y-1">
            <Badge
              size="sm"
              variant={connectivityBadgeVariant[state.connectivity]}
              icon={
                state.connectivity === 'online' ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <CloudOff className="h-3 w-3" />
                )
              }
            >
              {connectivityLabel}
            </Badge>
            <p className="text-xs text-muted-foreground">{connectivityHint}</p>
          </dd>
        </MutedSurface>

        <MutedSurface
          className={cn('space-y-2 rounded-xl p-3', compact ? 'bg-muted/12' : undefined)}
        >
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.unsyncedCount}
          </dt>
          <dd className="mt-2 text-sm font-semibold text-foreground">
            {state.unsyncedCount.toLocaleString()}
          </dd>
        </MutedSurface>

        <MutedSurface
          className={cn('space-y-2 rounded-xl p-3', compact ? 'bg-muted/12' : undefined)}
        >
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.nextAction}
          </dt>
          <dd className="mt-2">
            {nextActionHref ? (
              <Button
                asChild
                variant="outline"
                className={cn(
                  'h-auto min-w-0 w-full justify-start !whitespace-normal text-left',
                  compact ? 'px-4 py-3' : 'px-5 py-3',
                )}
              >
                <Link
                  href={nextActionHref}
                  className={cn('min-w-0 gap-2', compact ? '!items-center' : '!items-start')}
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                    <ArrowRightCircle className="h-4 w-4" />
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 break-words !whitespace-normal leading-snug',
                      compact ? 'text-sm' : undefined,
                    )}
                  >
                    {nextActionLabel}
                  </span>
                </Link>
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                <ArrowRightCircle className="h-3.5 w-3.5" />
                <span>{nextActionLabel}</span>
              </span>
            )}
          </dd>
        </MutedSurface>
      </dl>
    </Surface>
  );
}
