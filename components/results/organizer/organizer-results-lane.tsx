import { SafeNextDetailsMessage } from '@/components/results/primitives/safe-next-details-message';
import { ResultsStateRail } from '@/components/results/primitives/results-state-rail';
import { ResultsVersionVisibilityPanel } from '@/components/results/organizer/results-version-visibility-panel';
import { TableProResultsGrid } from '@/components/results/organizer/table-pro-results-grid';
import { Button } from '@/components/ui/button';
import { MutedSurface, Surface } from '@/components/ui/surface';
import { Link } from '@/i18n/navigation';
import type {
  OrganizerResultVersionVisibility,
  OrganizerResultsRailState,
  OrganizerResultsRow,
  SafeNextDetailsFeedback,
} from '@/lib/events/results/workspace';

type OrganizerResultsLaneProps = {
  eventId: string;
  densityStorageKey: string;
  railState: OrganizerResultsRailState;
  nextActionHref?: Parameters<typeof Link>[0]['href'];
  versionVisibility: {
    activeOfficialVersionId: OrganizerResultVersionVisibility['activeOfficialVersionId'];
    items: Array<
      OrganizerResultVersionVisibility['items'][number] & {
        finalizedAtLabel: string;
      }
    >;
  };
  rows: Array<
    Pick<
      OrganizerResultsRow,
      | 'id'
      | 'bibNumber'
      | 'runnerName'
      | 'validationState'
      | 'resultStatus'
      | 'syncStatus'
      | 'finishTimeMillis'
      | 'details'
    > & {
      updatedAtLabel: string;
    }
  >;
  feedbackItems: SafeNextDetailsFeedback[];
  labels: {
    stateRail: Parameters<typeof ResultsStateRail>[0]['labels'];
    versionVisibility: Parameters<typeof ResultsVersionVisibilityPanel>[0]['labels'];
    table: Parameters<typeof TableProResultsGrid>[0]['labels'];
    reviewGate: Parameters<
      typeof import('@/components/results/organizer/draft-review-finalization-gate').DraftReviewFinalizationGate
    >[0]['labels'];
    feedback: {
      heading: string;
      safe: string;
      next: string;
      details: string;
    };
  };
};

export function OrganizerResultsLane({
  eventId,
  densityStorageKey,
  railState,
  nextActionHref,
  versionVisibility,
  rows,
  feedbackItems,
  labels,
}: OrganizerResultsLaneProps) {
  const emptyReviewFeedback =
    rows.length === 0 ? feedbackItems.find((item) => item.id === 'review-empty') : null;
  const captureHref = {
    pathname: '/dashboard/events/[eventId]/results/capture',
    params: { eventId },
  } as const;
  const importHref = {
    pathname: '/dashboard/events/[eventId]/results/import',
    params: { eventId },
  } as const;

  if (emptyReviewFeedback) {
    return (
      <div className="space-y-6">
        <ResultsStateRail
          state={railState}
          labels={labels.stateRail}
          nextActionHref={nextActionHref}
        />

        <ResultsVersionVisibilityPanel
          visibility={versionVisibility}
          labels={labels.versionVisibility}
        />

        <Surface className="space-y-0 p-0 shadow-none">
          <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground sm:text-base">
                {labels.table.title}
              </h3>
              <p className="text-xs text-muted-foreground sm:text-sm">{labels.table.description}</p>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-5">
            <SafeNextDetailsMessage
              safe={emptyReviewFeedback.safe}
              next={emptyReviewFeedback.next}
              details={emptyReviewFeedback.details}
              tone={emptyReviewFeedback.tone}
              labels={{
                safe: labels.feedback.safe,
                next: labels.feedback.next,
                details: labels.feedback.details,
              }}
              actions={
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-auto min-w-0 w-full justify-start !whitespace-normal text-left sm:w-auto"
                  >
                    <Link href={captureHref} className="min-w-0">
                      {labels.reviewGate.remediationAction.capture}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-auto min-w-0 w-full justify-start !whitespace-normal text-left sm:w-auto"
                  >
                    <Link href={importHref} className="min-w-0">
                      {labels.reviewGate.remediationAction.import}
                    </Link>
                  </Button>
                </div>
              }
            />
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ResultsStateRail
        state={railState}
        labels={labels.stateRail}
        nextActionHref={nextActionHref}
      />

      <ResultsVersionVisibilityPanel
        visibility={versionVisibility}
        labels={labels.versionVisibility}
      />

      <TableProResultsGrid
        rows={rows}
        densityStorageKey={densityStorageKey}
        labels={labels.table}
      />

      {feedbackItems.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground sm:text-base">
            {labels.feedback.heading}
          </h3>
          <div className="grid gap-3">
            {feedbackItems.map((item) => (
              <MutedSurface key={item.id} className="p-0">
                <SafeNextDetailsMessage
                  safe={item.safe}
                  next={item.next}
                  details={item.details}
                  tone={item.tone}
                  labels={{
                    safe: labels.feedback.safe,
                    next: labels.feedback.next,
                    details: labels.feedback.details,
                  }}
                />
              </MutedSurface>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
