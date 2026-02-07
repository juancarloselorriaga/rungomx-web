import { SafeNextDetailsMessage } from '@/components/results/primitives/safe-next-details-message';
import { ResultsStateRail } from '@/components/results/primitives/results-state-rail';
import { ResultsVersionVisibilityPanel } from '@/components/results/organizer/results-version-visibility-panel';
import { TableProResultsGrid } from '@/components/results/organizer/table-pro-results-grid';
import type {
  OrganizerResultVersionVisibility,
  OrganizerResultsRailState,
  OrganizerResultsRow,
  SafeNextDetailsFeedback,
} from '@/lib/events/results/workspace';

type OrganizerResultsLaneProps = {
  densityStorageKey: string;
  railState: OrganizerResultsRailState;
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
    feedback: {
      heading: string;
      safe: string;
      next: string;
      details: string;
    };
  };
};

export function OrganizerResultsLane({
  densityStorageKey,
  railState,
  versionVisibility,
  rows,
  feedbackItems,
  labels,
}: OrganizerResultsLaneProps) {
  return (
    <div className="space-y-6">
      <ResultsStateRail state={railState} labels={labels.stateRail} />

      <ResultsVersionVisibilityPanel
        visibility={versionVisibility}
        labels={labels.versionVisibility}
      />

      <TableProResultsGrid
        rows={rows}
        densityStorageKey={densityStorageKey}
        labels={labels.table}
      />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground sm:text-base">
          {labels.feedback.heading}
        </h3>
        <div className="grid gap-3">
          {feedbackItems.map((item) => (
            <SafeNextDetailsMessage
              key={item.id}
              title={labels.feedback.heading}
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
          ))}
        </div>
      </section>
    </div>
  );
}
