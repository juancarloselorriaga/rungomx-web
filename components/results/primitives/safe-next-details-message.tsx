import { cn } from '@/lib/utils';

type SafeNextDetailsMessageProps = {
  title: string;
  safe: string;
  next: string;
  details: readonly string[];
  labels: {
    safe: string;
    next: string;
    details: string;
  };
  tone?: 'info' | 'warning' | 'danger';
  className?: string;
};

const toneClasses: Record<NonNullable<SafeNextDetailsMessageProps['tone']>, string> = {
  info: 'border-blue-200/80 bg-blue-50/50 dark:border-blue-900/60 dark:bg-blue-950/20',
  warning:
    'border-amber-200/80 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/20',
  danger: 'border-red-200/80 bg-red-50/60 dark:border-red-900/70 dark:bg-red-950/20',
};

export function SafeNextDetailsMessage({
  title,
  safe,
  next,
  details,
  labels,
  tone = 'info',
  className,
}: SafeNextDetailsMessageProps) {
  return (
    <article
      className={cn(
        'rounded-lg border p-4 shadow-sm',
        toneClasses[tone],
        className,
      )}
      role="alert"
      aria-live="polite"
    >
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.safe}
          </dt>
          <dd className="mt-1 text-foreground">{safe}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.next}
          </dt>
          <dd className="mt-1 text-foreground">{next}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.details}
          </dt>
          <dd className="mt-1 text-muted-foreground">
            <ul className="list-disc space-y-1 pl-5">
              {details.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </article>
  );
}
