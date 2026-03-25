import { Badge } from '@/components/common/badge';

type TrustScanStatus = 'official' | 'corrected' | null;

type TrustScanHeaderProps = {
  status: TrustScanStatus;
  organizerName: string | null;
  scope: string | null;
  version: string | null;
  updatedAt: string | null;
  labels: {
    title: string;
    description: string;
    fallback: string;
    fields: {
      organizer: string;
      scope: string;
      version: string;
      updatedAt: string;
      correction: string;
    };
    status: {
      official: string;
      corrected: string;
      unknown: string;
    };
    correction: {
      corrected: string;
      none: string;
    };
  };
};

function resolveStatusValue(status: TrustScanStatus, labels: TrustScanHeaderProps['labels']) {
  if (status === 'corrected') {
    return {
      badgeVariant: 'indigo' as const,
      label: labels.status.corrected,
      correctionLabel: labels.correction.corrected,
    };
  }

  if (status === 'official') {
    return {
      badgeVariant: 'green' as const,
      label: labels.status.official,
      correctionLabel: labels.correction.none,
    };
  }

  return {
    badgeVariant: 'outline' as const,
    label: labels.status.unknown,
    correctionLabel: labels.correction.none,
  };
}

function toFieldValue(value: string | null, fallback: string) {
  if (!value) return fallback;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

export function TrustScanHeader({
  status,
  organizerName,
  scope,
  version,
  updatedAt,
  labels,
}: TrustScanHeaderProps) {
  const statusValue = resolveStatusValue(status, labels);
  const fallback = labels.fallback;

  return (
    <section className="rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_80%,var(--background-surface)_20%)] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant={statusValue.badgeVariant}>{statusValue.label}</Badge>
          <h2 className="font-display mt-5 text-[clamp(1.45rem,2.5vw,1.95rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
            {labels.title}
          </h2>
          <p className="mt-3 max-w-[32rem] text-sm leading-7 text-muted-foreground">
            {labels.description}
          </p>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 border-t border-border/70 pt-5 text-sm leading-7 text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
            {labels.fields.organizer}
          </dt>
          <dd className="mt-1 text-foreground">{toFieldValue(organizerName, fallback)}</dd>
        </div>
        <div>
          <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
            {labels.fields.scope}
          </dt>
          <dd className="mt-1 text-foreground">{toFieldValue(scope, fallback)}</dd>
        </div>
        <div>
          <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
            {labels.fields.version}
          </dt>
          <dd className="mt-1 text-foreground">{toFieldValue(version, fallback)}</dd>
        </div>
        <div>
          <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
            {labels.fields.updatedAt}
          </dt>
          <dd className="mt-1 text-foreground">{toFieldValue(updatedAt, fallback)}</dd>
        </div>
        <div>
          <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
            {labels.fields.correction}
          </dt>
          <dd className="mt-1 text-foreground">{statusValue.correctionLabel}</dd>
        </div>
      </dl>
    </section>
  );
}
