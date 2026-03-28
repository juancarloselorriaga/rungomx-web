import { Badge } from '@/components/common/badge';
import { InsetSurface, MutedSurface, Surface } from '@/components/ui/surface';
import type { OrganizerResultVersionVisibility } from '@/lib/events/results/workspace';

type ResultsVersionVisibilityPanelProps = {
  visibility: {
    activeOfficialVersionId: OrganizerResultVersionVisibility['activeOfficialVersionId'];
    items: Array<
      OrganizerResultVersionVisibility['items'][number] & {
        finalizedAtLabel: string;
      }
    >;
  };
  labels: {
    title: string;
    description: string;
    empty: string;
    noOfficialVersion: string;
    activeOfficialLabel: string;
    activeMarker: string;
    historicalMarker: string;
    headers: {
      version: string;
      status: string;
      finalizedAt: string;
      finalizedBy: string;
      marker: string;
    };
    status: {
      draft: string;
      official: string;
      corrected: string;
    };
    unknownFinalizedAt: string;
    unknownFinalizedBy: string;
  };
};

function getStatusLabel(
  status: OrganizerResultVersionVisibility['items'][number]['status'],
  labels: ResultsVersionVisibilityPanelProps['labels']['status'],
): string {
  switch (status) {
    case 'official':
      return labels.official;
    case 'corrected':
      return labels.corrected;
    default:
      return labels.draft;
  }
}

function getStatusVariant(
  status: OrganizerResultVersionVisibility['items'][number]['status'],
): 'indigo' | 'green' | 'outline' {
  switch (status) {
    case 'official':
      return 'green';
    case 'corrected':
      return 'outline';
    default:
      return 'indigo';
  }
}

export function ResultsVersionVisibilityPanel({
  visibility,
  labels,
}: ResultsVersionVisibilityPanelProps) {
  return (
    <Surface className="space-y-4 p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-foreground sm:text-base">{labels.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{labels.description}</p>

      {visibility.items.length === 0 ? (
        <MutedSurface className="mt-4 p-3">
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        </MutedSurface>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {visibility.activeOfficialVersionId ? (
              <Badge size="sm" variant="green">
                {labels.activeOfficialLabel}
              </Badge>
            ) : (
              <Badge size="sm" variant="outline">
                {labels.noOfficialVersion}
              </Badge>
            )}
          </div>

          <InsetSurface className="mt-3 overflow-x-auto border-border/50 bg-background/55 p-0 shadow-none">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">{labels.headers.version}</th>
                  <th className="px-3 py-2 font-semibold">{labels.headers.status}</th>
                  <th className="px-3 py-2 font-semibold">{labels.headers.finalizedAt}</th>
                  <th className="px-3 py-2 font-semibold">{labels.headers.finalizedBy}</th>
                  <th className="px-3 py-2 font-semibold">{labels.headers.marker}</th>
                </tr>
              </thead>
              <tbody>
                {visibility.items.map((item) => (
                  <tr key={item.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {`v${item.versionNumber}`}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge size="sm" variant={getStatusVariant(item.status)}>
                        {getStatusLabel(item.status, labels.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {item.finalizedAt ? item.finalizedAtLabel : labels.unknownFinalizedAt}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {item.finalizedByUserId ?? labels.unknownFinalizedBy}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge size="sm" variant={item.isActiveOfficial ? 'green' : 'outline'}>
                        {item.isActiveOfficial ? labels.activeMarker : labels.historicalMarker}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </InsetSurface>
        </>
      )}
    </Surface>
  );
}
