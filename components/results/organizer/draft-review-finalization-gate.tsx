'use client';

import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { InsetSurface, Surface } from '@/components/ui/surface';
import { Link } from '@/i18n/navigation';
import { finalizeResultVersionAttestation } from '@/lib/events/results/actions';
import type {
  OrganizerDraftReviewIssue,
  OrganizerDraftReviewSummary,
} from '@/lib/events/results/workspace';
import { useMemo, useState, useTransition } from 'react';

type DraftReviewFinalizationGateProps = {
  eventId: string;
  summary: OrganizerDraftReviewSummary;
  labels: {
    title: string;
    description: string;
    attemptProceedAction: string;
    finalizePendingAction: string;
    proceedBlockedMessage: string;
    proceedReadyMessage: string;
    proceedUnavailableMessage: string;
    finalizeSuccessMessage: string;
    finalizeFailurePrefix: string;
    nextRequiredActionLabel: string;
    issueListTitle: string;
    issueListDescription: string;
    issueListEmpty: string;
    blockerCountLabel: string;
    warningCountLabel: string;
    rowCountLabel: string;
    issueSeverity: {
      blocker: string;
      warning: string;
    };
    issueFields: {
      bib: string;
      runner: string;
      guidance: string;
    };
    remediationAction: {
      capture: string;
      import: string;
    };
  };
};

function getRemediationRoute(
  eventId: string,
  issue: OrganizerDraftReviewIssue,
): Parameters<typeof Link>[0]['href'] {
  if (issue.remediationLane === 'capture') {
    return {
      pathname: '/dashboard/events/[eventId]/results/capture',
      params: { eventId },
    };
  }

  return {
    pathname: '/dashboard/events/[eventId]/results/import',
    params: { eventId },
  };
}

function getSeverityVariant(severity: OrganizerDraftReviewIssue['severity']): 'outline' | 'indigo' {
  return severity === 'blocker' ? 'outline' : 'indigo';
}

export function DraftReviewFinalizationGate({
  eventId,
  summary,
  labels,
}: DraftReviewFinalizationGateProps) {
  const [attemptedProceed, setAttemptedProceed] = useState(false);
  const [isSubmittingFinalization, startFinalizationTransition] = useTransition();
  const [finalizationFeedback, setFinalizationFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  const isDraftEmpty = summary.rowCount === 0;

  const proceedFeedback = useMemo(() => {
    if (isDraftEmpty) return 'unavailable' as const;
    if (!attemptedProceed) return null;
    return summary.canProceed ? ('ready' as const) : ('blocked' as const);
  }, [attemptedProceed, isDraftEmpty, summary.canProceed]);

  const handleAttemptProceed = () => {
    setAttemptedProceed(true);
    setFinalizationFeedback(null);

    if (summary.rowCount === 0 || !summary.canProceed) return;

    startFinalizationTransition(async () => {
      const result = await finalizeResultVersionAttestation({
        editionId: eventId,
        attestationConfirmed: true,
      });

      if (result.ok) {
        setFinalizationFeedback({
          tone: 'success',
          message: labels.finalizeSuccessMessage,
        });
        return;
      }

      setFinalizationFeedback({
        tone: 'error',
        message: `${labels.finalizeFailurePrefix} ${result.error}`,
      });
    });
  };

  return (
    <Surface className="space-y-4 p-4 sm:p-5">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground sm:text-base">{labels.title}</h3>
        <p className="text-xs text-muted-foreground sm:text-sm">{labels.description}</p>
      </header>

      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <InsetSurface className="bg-muted/25 p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.rowCountLabel}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {summary.rowCount.toLocaleString()}
          </dd>
        </InsetSurface>
        <InsetSurface className="bg-muted/25 p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.blockerCountLabel}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {summary.blockerCount.toLocaleString()}
          </dd>
        </InsetSurface>
        <InsetSurface className="bg-muted/25 p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.warningCountLabel}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {summary.warningCount.toLocaleString()}
          </dd>
        </InsetSurface>
      </dl>

      <InsetSurface className="space-y-3 bg-muted/25 p-3">
        <Button
          type="button"
          disabled={isDraftEmpty || isSubmittingFinalization}
          onClick={handleAttemptProceed}
        >
          {isSubmittingFinalization ? labels.finalizePendingAction : labels.attemptProceedAction}
        </Button>

        {proceedFeedback === 'blocked' ? (
          <div
            className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            data-testid="draft-review-proceed-feedback"
          >
            <p>{labels.proceedBlockedMessage}</p>
            {summary.nextRequiredAction ? (
              <p>
                <span className="font-semibold">{labels.nextRequiredActionLabel}: </span>
                {summary.nextRequiredAction.message}
              </p>
            ) : null}
          </div>
        ) : null}

        {proceedFeedback === 'ready' ? (
          <p
            className="rounded-md border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
            data-testid="draft-review-proceed-feedback"
          >
            {labels.proceedReadyMessage}
          </p>
        ) : null}

        {proceedFeedback === 'unavailable' ? (
          <p
            className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground dark:bg-muted/60"
            data-testid="draft-review-proceed-feedback"
          >
            {labels.proceedUnavailableMessage}
          </p>
        ) : null}

        {finalizationFeedback ? (
          <p
            className={
              finalizationFeedback.tone === 'success'
                ? 'rounded-md border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100'
                : 'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
            }
            data-testid="draft-review-finalization-feedback"
          >
            {finalizationFeedback.message}
          </p>
        ) : null}
      </InsetSurface>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">{labels.issueListTitle}</h4>
        <p className="text-xs text-muted-foreground">{labels.issueListDescription}</p>

        {summary.issues.length === 0 ? (
          <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground dark:bg-muted/60">
            {labels.issueListEmpty}
          </p>
        ) : (
          <div className="space-y-3">
            {summary.issues.map((issue) => (
              <article
                key={issue.id}
                className="space-y-3 rounded-md border bg-muted/30 p-3 dark:bg-muted/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge size="sm" variant={getSeverityVariant(issue.severity)}>
                    {issue.severity === 'blocker'
                      ? labels.issueSeverity.blocker
                      : labels.issueSeverity.warning}
                  </Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link href={getRemediationRoute(eventId, issue)}>
                      {issue.remediationLane === 'capture'
                        ? labels.remediationAction.capture
                        : labels.remediationAction.import}
                    </Link>
                  </Button>
                </div>

                <p className="text-sm font-medium text-foreground">{issue.message}</p>
                <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {labels.issueFields.bib}
                    </dt>
                    <dd>{issue.rowBibNumber ?? '-'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {labels.issueFields.runner}
                    </dt>
                    <dd>{issue.rowRunnerName}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {labels.issueFields.guidance}
                    </dt>
                    <dd>{issue.guidance}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </Surface>
  );
}
