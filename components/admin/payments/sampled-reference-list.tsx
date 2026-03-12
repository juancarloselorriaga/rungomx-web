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
    <div className={compact ? 'mt-1 space-y-1.5' : 'mt-4 space-y-2'}>
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
      {scopeLabel ? (
        <p className={compact ? 'text-[11px] text-muted-foreground' : 'text-xs text-muted-foreground'}>
          {scopeLabel(shownCount, resolvedTotalCount)}
        </p>
      ) : countLabel ? (
        <p className={compact ? 'text-[11px] text-muted-foreground' : 'text-xs text-muted-foreground'}>
          {countLabel(items.length)}
        </p>
      ) : null}
      <ul className={compact ? 'space-y-1' : 'space-y-2'}>
        {visibleItems.map((item) => (
          <li key={item}>
            <code
              className={
                compact
                  ? 'block rounded bg-muted px-2 py-1 text-[11px] text-foreground'
                  : 'block rounded bg-muted px-2 py-1 text-xs text-foreground'
              }
              title={item}
            >
              {truncateMiddle(item)}
            </code>
          </li>
        ))}
      </ul>
      {hiddenItems.length > 0 ? (
        <details className={compact ? 'text-[11px]' : 'text-xs'}>
          <summary className="cursor-pointer font-medium text-primary">
            {moreLabel(hiddenItems.length)}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {hiddenItems.map((item) => (
              <li key={item}>
                <code
                  className={
                    compact
                      ? 'block rounded bg-muted px-2 py-1 text-[11px] text-foreground'
                      : 'block rounded bg-muted px-2 py-1 text-xs text-foreground'
                  }
                  title={item}
                >
                  {truncateMiddle(item)}
                </code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
