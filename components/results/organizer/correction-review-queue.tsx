'use client';

import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { InsetSurface, Surface } from '@/components/ui/surface';
import { reviewResultCorrectionRequest } from '@/lib/events/results/actions';
import type { OrganizerCorrectionRequestQueueItem } from '@/lib/events/results/types';
import { useRouter } from '@/i18n/navigation';
import { useMemo, useState, useTransition } from 'react';

type CorrectionReviewQueueProps = {
  requests: Array<
    OrganizerCorrectionRequestQueueItem & {
      requestedAtLabel: string;
      reviewedAtLabel: string | null;
    }
  >;
  labels: {
    title: string;
    description: string;
    empty: string;
    status: {
      pending: string;
      approved: string;
      rejected: string;
    };
    fields: {
      reason: string;
      context: string;
      requestedBy: string;
      requestedAt: string;
      reviewedBy: string;
      reviewedAt: string;
      reviewNote: string;
      runner: string;
      bib: string;
      entryStatus: string;
      finishTime: string;
    };
    review: {
      notePlaceholder: string;
      approveAction: string;
      rejectAction: string;
      pendingAction: string;
      successMessage: string;
      failurePrefix: string;
      noDecisionYet: string;
      noContext: string;
      noReviewNote: string;
      noValue: string;
    };
  };
};

function getStatusBadgeVariant(
  status: OrganizerCorrectionRequestQueueItem['status'],
): 'outline' | 'green' | 'indigo' {
  if (status === 'approved') return 'green';
  if (status === 'rejected') return 'outline';
  return 'indigo';
}

function getStatusLabel(
  status: OrganizerCorrectionRequestQueueItem['status'],
  labels: CorrectionReviewQueueProps['labels']['status'],
): string {
  if (status === 'approved') return labels.approved;
  if (status === 'rejected') return labels.rejected;
  return labels.pending;
}

export function CorrectionReviewQueue({ requests, labels }: CorrectionReviewQueueProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [notesByRequestId, setNotesByRequestId] = useState<Record<string, string>>({});
  const [feedbackByRequestId, setFeedbackByRequestId] = useState<
    Record<string, { tone: 'success' | 'error'; message: string }>
  >({});

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === 'pending').length,
    [requests],
  );

  const handleReview = (requestId: string, decision: 'approve' | 'reject') => {
    setActiveRequestId(requestId);

    startTransition(async () => {
      const note = notesByRequestId[requestId]?.trim();
      const result = await reviewResultCorrectionRequest({
        requestId,
        decision,
        reviewDecisionNote: note ? note : undefined,
      });

      if (result.ok) {
        setFeedbackByRequestId((current) => ({
          ...current,
          [requestId]: {
            tone: 'success',
            message: labels.review.successMessage,
          },
        }));
        router.refresh();
        setActiveRequestId(null);
        return;
      }

      setFeedbackByRequestId((current) => ({
        ...current,
        [requestId]: {
          tone: 'error',
          message: `${labels.review.failurePrefix} ${result.error}`,
        },
      }));
      setActiveRequestId(null);
    });
  };

  return (
    <Surface className="space-y-4 p-4 sm:p-5">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground sm:text-base">{labels.title}</h3>
        <p className="text-xs text-muted-foreground sm:text-sm">{labels.description}</p>
        <p className="text-xs text-muted-foreground">
          {labels.status.pending}: {pendingCount.toLocaleString()}
        </p>
      </header>

      {requests.length === 0 ? (
        <InsetSurface className="bg-muted/25 px-3 py-2">
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        </InsetSurface>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const isPendingRow = request.status === 'pending';
            const isSubmittingRow =
              isPending && activeRequestId === request.requestId && isPendingRow;
            const feedback = feedbackByRequestId[request.requestId];
            const contextKeys = Object.keys(request.requestContext ?? {});

            return (
              <article
                key={request.requestId}
                className="space-y-3 rounded-md border bg-muted/30 p-3 dark:bg-muted/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {labels.fields.runner}: {request.runnerFullName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {labels.fields.bib}: {request.bibNumber ?? labels.review.noValue}
                    </p>
                  </div>
                  <Badge size="sm" variant={getStatusBadgeVariant(request.status)}>
                    {getStatusLabel(request.status, labels.status)}
                  </Badge>
                </div>

                <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {labels.fields.requestedBy}
                    </dt>
                    <dd>{request.requestedByUserId}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {labels.fields.requestedAt}
                    </dt>
                    <dd>{request.requestedAtLabel}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {labels.fields.reviewedBy}
                    </dt>
                    <dd>{request.reviewedByUserId ?? labels.review.noDecisionYet}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {labels.fields.reviewedAt}
                    </dt>
                    <dd>{request.reviewedAtLabel ?? labels.review.noDecisionYet}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {labels.fields.entryStatus}
                    </dt>
                    <dd>{request.resultStatus}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {labels.fields.finishTime}
                    </dt>
                    <dd>
                      {typeof request.finishTimeMillis === 'number'
                        ? request.finishTimeMillis.toLocaleString()
                        : labels.review.noValue}
                    </dd>
                  </div>
                </dl>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {labels.fields.reason}
                  </p>
                  <p className="rounded-md border border-border/70 bg-background px-3 py-2 text-sm">
                    {request.reason}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {labels.fields.context}
                  </p>
                  {contextKeys.length === 0 ? (
                    <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      {labels.review.noContext}
                    </p>
                  ) : (
                    <pre className="overflow-x-auto rounded-md border border-border/70 bg-background px-3 py-2 text-xs text-foreground">
                      {JSON.stringify(request.requestContext, null, 2)}
                    </pre>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {labels.fields.reviewNote}
                  </p>
                  {isPendingRow ? (
                    <textarea
                      value={notesByRequestId[request.requestId] ?? ''}
                      onChange={(event) =>
                        setNotesByRequestId((current) => ({
                          ...current,
                          [request.requestId]: event.target.value,
                        }))
                      }
                      maxLength={500}
                      placeholder={labels.review.notePlaceholder}
                      className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  ) : (
                    <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      {request.reviewDecisionNote ?? labels.review.noReviewNote}
                    </p>
                  )}
                </div>

                {isPendingRow ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSubmittingRow}
                      onClick={() => handleReview(request.requestId, 'approve')}
                    >
                      {isSubmittingRow ? labels.review.pendingAction : labels.review.approveAction}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSubmittingRow}
                      onClick={() => handleReview(request.requestId, 'reject')}
                    >
                      {isSubmittingRow ? labels.review.pendingAction : labels.review.rejectAction}
                    </Button>
                  </div>
                ) : null}

                {feedback ? (
                  <p
                    className={
                      feedback.tone === 'success'
                        ? 'rounded-md border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100'
                        : 'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
                    }
                  >
                    {feedback.message}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </Surface>
  );
}
