import { cn } from '@/lib/utils';

function truncateMiddle(value: string, start = 16, end = 10): string {
  if (value.length <= start + end + 1) {
    return value;
  }

  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

type SampledReferenceListProps = {
  title?: string;
  items: string[];
  emptyLabel?: string;
  totalCount?: number;
  scopeLabel?: (shown: number, total: number) => string;
  countLabel?: (count: number) => string;
  moreLabel: (count: number) => string;
  initialVisibleCount?: number;
  compact?: boolean;
};

export function SampledReferenceList({
  title,
  items,
  emptyLabel,
  totalCount,
  scopeLabel,
  countLabel,
  moreLabel,
  initialVisibleCount = 3,
  compact = false,
}: SampledReferenceListProps) {
  const visibleItems = items.slice(0, initialVisibleCount);
  const hiddenItems = items.slice(initialVisibleCount);
  const shownCount = visibleItems.length;
  const resolvedTotalCount = totalCount ?? items.length;

  if (items.length === 0) {
    if (!emptyLabel) {
      return null;
    }

    return compact ? (
      <p className="mt-1 text-[11px] text-muted-foreground">{emptyLabel}</p>
    ) : (
      <p className="mt-2 text-sm text-muted-foreground">{emptyLabel}</p>
    );
  }

  return (
    <div className={compact ? 'mt-1 space-y-2' : 'mt-4 space-y-3'}>
      {title || countLabel || totalCount ? (
        <div className="flex flex-wrap items-center gap-2">
          {title ? (
            <h4
              className={
                compact
                  ? 'text-[11px] uppercase tracking-wide text-muted-foreground'
                  : 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
              }
            >
              {title}
            </h4>
          ) : null}
          <span
            className={cn(
              'inline-flex items-center rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 font-medium text-muted-foreground',
              compact ? 'text-[11px]' : 'text-xs',
            )}
          >
            {countLabel ? countLabel(resolvedTotalCount) : resolvedTotalCount}
          </span>
        </div>
      ) : null}
      {scopeLabel ? (
        <p className={compact ? 'text-[11px] text-muted-foreground' : 'text-xs text-muted-foreground'}>
          {scopeLabel(shownCount, resolvedTotalCount)}
        </p>
      ) : null}
      <ul className={compact ? 'space-y-1.5' : 'space-y-2'}>
        {visibleItems.map((item) => (
          <li key={item}>
            <div
              className={cn(
                'rounded-lg border border-border/50 bg-background/70',
                compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
              )}
            >
              <code
                className={compact ? 'block text-[11px] text-foreground' : 'block text-xs text-foreground'}
                title={item}
              >
                {truncateMiddle(item)}
              </code>
            </div>
          </li>
        ))}
      </ul>
      {hiddenItems.length > 0 ? (
        <details className={compact ? 'text-[11px]' : 'text-xs'}>
          <summary className="cursor-pointer font-medium text-primary marker:text-primary">
            {moreLabel(hiddenItems.length)}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {hiddenItems.map((item) => (
              <li key={item}>
                <div
                  className={cn(
                    'rounded-lg border border-border/50 bg-background/70',
                    compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
                  )}
                >
                  <code
                    className={compact ? 'block text-[11px] text-foreground' : 'block text-xs text-foreground'}
                    title={item}
                  >
                    {truncateMiddle(item)}
                  </code>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
