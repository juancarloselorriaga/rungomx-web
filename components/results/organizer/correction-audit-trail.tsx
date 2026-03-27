import { InsetSurface, Surface } from '@/components/ui/surface';
import type { CorrectionAuditTrailItem } from '@/lib/events/results/types';

type CorrectionAuditTrailProps = {
  items: Array<
    CorrectionAuditTrailItem & {
      requestedAtLabel: string;
      reviewedAtLabel: string | null;
      publishedAtLabel: string | null;
    }
  >;
  labels: {
    title: string;
    description: string;
    empty: string;
    fields: {
      requestId: string;
      reason: string;
      requestedBy: string;
      reviewedBy: string;
      requestedAt: string;
      reviewedAt: string;
      publishedAt: string;
      versionTransition: string;
    };
    fallback: {
      pending: string;
      noPublishedAt: string;
    };
  };
};

export function CorrectionAuditTrail({ items, labels }: CorrectionAuditTrailProps) {
  return (
    <Surface className="space-y-4 p-4 sm:p-5">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground sm:text-base">{labels.title}</h3>
        <p className="text-xs text-muted-foreground sm:text-sm">{labels.description}</p>
      </header>

      {items.length === 0 ? (
        <InsetSurface className="bg-muted/25 px-3 py-2">
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        </InsetSurface>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article
              key={item.requestId}
              className="space-y-2 rounded-md border bg-muted/30 p-3 dark:bg-muted/60"
            >
              <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="font-semibold uppercase tracking-wide">
                    {labels.fields.requestId}
                  </dt>
                  <dd className="font-mono text-[11px] text-foreground">{item.requestId}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">
                    {labels.fields.requestedBy}
                  </dt>
                  <dd>{item.requestedByUserId}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">
                    {labels.fields.reviewedBy}
                  </dt>
                  <dd>{item.reviewedByUserId ?? labels.fallback.pending}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">
                    {labels.fields.versionTransition}
                  </dt>
                  <dd className="font-mono text-[11px] text-foreground">
                    {item.sourceResultVersionId} {'->'} {item.correctedResultVersionId}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">
                    {labels.fields.requestedAt}
                  </dt>
                  <dd>{item.requestedAtLabel}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">
                    {labels.fields.reviewedAt}
                  </dt>
                  <dd>{item.reviewedAtLabel ?? labels.fallback.pending}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">
                    {labels.fields.publishedAt}
                  </dt>
                  <dd>{item.publishedAtLabel ?? labels.fallback.noPublishedAt}</dd>
                </div>
              </dl>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.fields.reason}
                </p>
                <p className="text-sm text-foreground">{item.reason}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </Surface>
  );
}
