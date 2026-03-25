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
    <section className="border-t border-border/70 pt-8 md:pt-10">
      <header className="max-w-[46rem] space-y-3">
        <h2 className="font-display text-[clamp(1.8rem,3vw,2.5rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
          {labels.title}
        </h2>
        <p className="text-base leading-7 text-muted-foreground">{labels.description}</p>
      </header>

      {summaries.length === 0 ? (
        <p className="mt-8 rounded-[1.2rem] border border-border/60 bg-[color-mix(in_oklch,var(--background)_80%,var(--background-surface)_20%)] px-4 py-3 text-sm text-muted-foreground">
          {labels.empty}
        </p>
      ) : (
        <div className="mt-8 space-y-4">
          {summaries.map((summary) => (
            <article
              key={summary.requestId}
              className="space-y-4 rounded-[1.3rem] border border-border/60 bg-[color-mix(in_oklch,var(--background)_80%,var(--background-surface)_20%)] p-4 md:p-5"
            >
              <dl className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="font-semibold uppercase tracking-[0.16em]">
                    {labels.fields.approvedBy}
                  </dt>
                  <dd className="mt-1 text-sm leading-7">
                    {summary.approvedByDisplayName ?? labels.fallback.unknownApprover}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-[0.16em]">
                    {labels.fields.approvedAt}
                  </dt>
                  <dd className="mt-1 text-sm leading-7">
                    {summary.approvedAtLabel ?? labels.fallback.unknownTime}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-semibold uppercase tracking-[0.16em]">
                    {labels.fields.versionTransition}
                  </dt>
                  <dd className="mt-1 font-mono text-[11px] leading-7 text-foreground">
                    {summary.sourceResultVersionId} {'->'} {summary.correctedResultVersionId}
                  </dd>
                </div>
              </dl>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {labels.fields.reason}
                </p>
                <p className="text-sm leading-7 text-foreground">{summary.reason}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {labels.fields.changes}
                </p>
                {summary.changeSummary.length === 0 ? (
                  <p className="text-sm leading-7 text-muted-foreground">{labels.fallback.noChanges}</p>
                ) : (
                  <ul className="space-y-1 text-sm leading-7 text-foreground">
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
