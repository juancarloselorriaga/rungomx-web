import { Button } from '@/components/ui/button';
import type { FinancialEvidencePack } from '@/lib/payments/support/evidence-pack';

type EvidencePackReviewLabels = {
  sectionTitle: string;
  sectionDescription: string;
  requestTitle: string;
  requestDescription: string;
  traceFieldLabel: string;
  tracePlaceholder: string;
  loadButtonLabel: string;
  noTraceTitle: string;
  noTraceState: string;
  notFoundTitle: string;
  notFoundState: string;
  summaryTitle: string;
  summaryDescription: string;
  traceCreatedLabel: string;
  firstEventLabel: string;
  lastEventLabel: string;
  rootEntityLabel: string;
  redactionLabel: string;
  currentStateLabel: string;
  currentOwnerLabel: string;
  nextTransitionLabel: string;
  policyContextTitle: string;
  policyContextEmpty: string;
  eventsTitle: string;
  eventsDescription: string;
  eventTimeHeader: string;
  eventNameHeader: string;
  eventEntityHeader: string;
  eventOwnershipStateHeader: string;
  eventOwnershipOwnerHeader: string;
  eventOwnershipNextHeader: string;
  eventPayloadHeader: string;
  artifactsVersionsTitle: string;
  artifactsDeliveriesTitle: string;
  artifactVersionHeader: string;
  artifactFingerprintHeader: string;
  artifactLineageHeader: string;
  artifactReasonHeader: string;
  artifactCreatedHeader: string;
  deliveryChannelHeader: string;
  deliveryRecipientHeader: string;
  deliveryReasonHeader: string;
  deliveryCreatedHeader: string;
};

type EvidencePackReviewDashboardProps = {
  locale: 'es' | 'en';
  selectedRange: '7d' | '14d' | '30d';
  searchQuery: string;
  selectedTraceId: string;
  evidencePack: FinancialEvidencePack | null;
  labels: EvidencePackReviewLabels;
  workspace?: string;
  investigationTool?: 'lookup' | 'trace';
};

function formatDate(value: Date | string | null | undefined, locale: 'es' | 'en'): string {
  if (!value) return '—';
  const normalized = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(normalized.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(normalized);
}

function truncateJson(value: unknown, limit = 120): string {
  const raw = JSON.stringify(value);
  if (raw.length <= limit) return raw;
  return `${raw.slice(0, limit)}...`;
}

function truncateMiddle(value: string | null | undefined, start = 10, end = 6): string {
  if (!value) return '—';
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function formatOwnershipState(value: string, locale: 'es' | 'en'): string {
  if (value === 'action_needed') return locale === 'es' ? 'Acción requerida' : 'Action needed';
  if (value === 'in_progress') return locale === 'es' ? 'En progreso' : 'In progress';
  return value;
}

function formatPolicyContext(value: Record<string, unknown>): Array<{ key: string; value: string }> {
  return Object.entries(value).map(([key, entry]) => ({
    key,
    value: truncateJson(entry, 180),
  }));
}

export function EvidencePackReviewDashboard({
  locale,
  selectedRange,
  searchQuery,
  selectedTraceId,
  evidencePack,
  labels,
  workspace,
  investigationTool,
}: EvidencePackReviewDashboardProps) {
  const traceInput = selectedTraceId.trim();
  const hasTrace = traceInput.length > 0;

  const policyRows = evidencePack ? formatPolicyContext(evidencePack.policyContext) : [];
  const ownershipByEventId = new Map(
    evidencePack?.ownership.timeline.map((entry) => [entry.eventId, entry]) ?? [],
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{labels.sectionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.sectionDescription}</p>
      </div>

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{labels.requestTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.requestDescription}</p>
        <form method="get" className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input type="hidden" name="range" value={selectedRange} />
          <input type="hidden" name="lookupQuery" value={searchQuery} />
          {workspace ? <input type="hidden" name="workspace" value={workspace} /> : null}
          {investigationTool ? (
            <input type="hidden" name="investigationTool" value={investigationTool} />
          ) : null}
          <label className="space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              {labels.traceFieldLabel}
            </span>
            <input
              name="evidenceTraceId"
              defaultValue={selectedTraceId}
              maxLength={128}
              placeholder={labels.tracePlaceholder}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="self-end">
            <Button type="submit" className="w-full md:w-auto">
              {labels.loadButtonLabel}
            </Button>
          </div>
        </form>
      </div>

      {!hasTrace ? (
        <div className="rounded-xl border border-dashed bg-card/60 p-4 shadow-sm">
          <p className="text-sm font-medium">{labels.noTraceTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">{labels.noTraceState}</p>
        </div>
      ) : !evidencePack ? (
        <div className="rounded-xl border border-dashed bg-card/60 p-4 shadow-sm">
          <p className="text-sm font-medium">{labels.notFoundTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">{labels.notFoundState}</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold">{labels.summaryTitle}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{labels.summaryDescription}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {labels.traceCreatedLabel}
                </p>
                <p className="mt-1 text-sm">{formatDate(evidencePack.keyTimestamps.traceCreatedAt, locale)}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {labels.firstEventLabel}
                </p>
                <p className="mt-1 text-sm">{formatDate(evidencePack.keyTimestamps.firstEventAt, locale)}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {labels.lastEventLabel}
                </p>
                <p className="mt-1 text-sm">{formatDate(evidencePack.keyTimestamps.lastEventAt, locale)}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {labels.rootEntityLabel}
                </p>
                <p className="mt-1 text-xs font-mono">
                  {evidencePack.rootEntity.entityType}:
                  {truncateMiddle(evidencePack.rootEntity.entityId)}
                </p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {labels.redactionLabel}
                </p>
                <p className="mt-1 text-xs">
                  {evidencePack.redaction.viewRole} ({evidencePack.redaction.redactedPaths.length})
                </p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {labels.currentStateLabel}
                </p>
                <p className="mt-1 text-xs">
                  {formatOwnershipState(evidencePack.ownership.currentState, locale)}
                </p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {labels.currentOwnerLabel}
                </p>
                <p className="mt-1 text-xs">{evidencePack.ownership.currentOwner}</p>
              </div>
              <div className="rounded border p-3 md:col-span-2 xl:col-span-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {labels.nextTransitionLabel}
                </p>
                <p className="mt-1 text-xs">{evidencePack.ownership.nextExpectedTransition}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold">{labels.policyContextTitle}</h3>
            {policyRows.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{labels.policyContextEmpty}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {policyRows.map((row) => (
                  <div key={row.key} className="rounded border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{row.key}</p>
                    <p className="mt-1 text-xs font-mono">{row.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold">{labels.eventsTitle}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{labels.eventsDescription}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[72rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-4">{labels.eventTimeHeader}</th>
                    <th className="pb-2 pr-4">{labels.eventNameHeader}</th>
                    <th className="pb-2 pr-4">{labels.eventEntityHeader}</th>
                    <th className="pb-2 pr-4">{labels.eventOwnershipStateHeader}</th>
                    <th className="pb-2 pr-4">{labels.eventOwnershipOwnerHeader}</th>
                    <th className="pb-2 pr-4">{labels.eventOwnershipNextHeader}</th>
                    <th className="pb-2">{labels.eventPayloadHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {evidencePack.lifecycleEvents.map((event) => (
                    <tr key={event.id} className="border-t align-top">
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {formatDate(event.occurredAt, locale)}
                      </td>
                      <td className="py-2 pr-4 text-xs">{event.eventName}</td>
                      <td className="py-2 pr-4 text-xs">
                        {event.entityType}:{event.entityId}
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {formatOwnershipState(
                          ownershipByEventId.get(event.id)?.ownershipState ?? 'in_progress',
                          locale,
                        )}
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {ownershipByEventId.get(event.id)?.currentOwner ?? 'platform'}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {ownershipByEventId.get(event.id)?.nextExpectedTransition ?? 'platform.lifecycle_update'}
                      </td>
                      <td className="py-2 text-xs font-mono">
                        {truncateJson(event.payloadJson, 180)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
              <h3 className="text-sm font-semibold">{labels.artifactsVersionsTitle}</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-4">{labels.artifactVersionHeader}</th>
                      <th className="pb-2 pr-4">{labels.artifactFingerprintHeader}</th>
                      <th className="pb-2 pr-4">{labels.artifactLineageHeader}</th>
                      <th className="pb-2 pr-4">{labels.artifactReasonHeader}</th>
                      <th className="pb-2">{labels.artifactCreatedHeader}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidencePack.artifacts.versions.map((version) => (
                      <tr key={version.id} className="border-t align-top">
                        <td className="py-2 pr-4 tabular-nums">{version.artifactVersion}</td>
                        <td
                          className="py-2 pr-4 font-mono text-xs"
                          title={version.fingerprint}
                        >
                          {truncateMiddle(version.fingerprint)}
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {version.rebuiltFromVersionId
                            ? truncateMiddle(version.rebuiltFromVersionId)
                            : 'root'}
                        </td>
                        <td className="py-2 pr-4 text-xs">{version.reasonCode}</td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {formatDate(version.createdAt, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
              <h3 className="text-sm font-semibold">{labels.artifactsDeliveriesTitle}</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-4">{labels.deliveryChannelHeader}</th>
                      <th className="pb-2 pr-4">{labels.deliveryRecipientHeader}</th>
                      <th className="pb-2 pr-4">{labels.deliveryReasonHeader}</th>
                      <th className="pb-2">{labels.deliveryCreatedHeader}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidencePack.artifacts.deliveries.map((delivery) => (
                      <tr key={delivery.id} className="border-t align-top">
                        <td className="py-2 pr-4 text-xs">{delivery.channel}</td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {truncateMiddle(delivery.recipientReference, 14, 6)}
                        </td>
                        <td className="py-2 pr-4 text-xs">{delivery.reasonCode}</td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {formatDate(delivery.createdAt, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
