import type { PublicCorrectionSummaryItem } from '@/lib/events/results/types';

type CorrectionSummaryBlockProps = {
  summaries: Array<
    PublicCorrectionSummaryItem & {
      approvedAtLabel: string | null;
    }
  >;
  labels: {
    title: string;
    description: string;
    empty: string;
    fields: {
      reason: string;
      changes: string;
      approvedBy: string;
      approvedAt: string;
      versionTransition: string;
    };
    fallback: {
      unknownApprover: string;
      unknownTime: string;
      noChanges: string;
    };
  };
};

export function CorrectionSummaryBlock({ summaries, labels }: CorrectionSummaryBlockProps) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{labels.title}</h2>
        <p className="text-sm text-muted-foreground">{labels.description}</p>
      </header>

      {summaries.length === 0 ? (
        <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {labels.empty}
        </p>
      ) : (
        <div className="space-y-3">
          {summaries.map((summary) => (
            <article
              key={summary.requestId}
              className="space-y-3 rounded-md border bg-background/50 p-3"
            >
              <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="font-semibold uppercase tracking-wide">
                    {labels.fields.approvedBy}
                  </dt>
                  <dd>{summary.approvedByDisplayName ?? labels.fallback.unknownApprover}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">
                    {labels.fields.approvedAt}
                  </dt>
                  <dd>{summary.approvedAtLabel ?? labels.fallback.unknownTime}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-semibold uppercase tracking-wide">
                    {labels.fields.versionTransition}
                  </dt>
                  <dd className="font-mono text-[11px] text-foreground">
                    {summary.sourceResultVersionId} {'->'} {summary.correctedResultVersionId}
                  </dd>
                </div>
              </dl>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.fields.reason}
                </p>
                <p className="text-sm text-foreground">{summary.reason}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.fields.changes}
                </p>
                {summary.changeSummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{labels.fallback.noChanges}</p>
                ) : (
                  <ul className="space-y-1 text-sm text-foreground">
                    {summary.changeSummary.map((change) => (
                      <li key={`${summary.requestId}:${change.field}`} className="font-mono text-[12px]">
                        {change.field}: {change.value}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
