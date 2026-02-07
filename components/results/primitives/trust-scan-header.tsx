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
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{labels.title}</h2>
          <p className="text-xs text-muted-foreground">{labels.description}</p>
        </div>
        <Badge variant={statusValue.badgeVariant}>{statusValue.label}</Badge>
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-5">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{labels.fields.organizer}</dt>
          <dd className="font-medium text-foreground">{toFieldValue(organizerName, fallback)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{labels.fields.scope}</dt>
          <dd className="font-medium text-foreground">{toFieldValue(scope, fallback)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{labels.fields.version}</dt>
          <dd className="font-medium text-foreground">{toFieldValue(version, fallback)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{labels.fields.updatedAt}</dt>
          <dd className="font-medium text-foreground">{toFieldValue(updatedAt, fallback)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{labels.fields.correction}</dt>
          <dd className="font-medium text-foreground">{statusValue.correctionLabel}</dd>
        </div>
      </dl>
    </section>
  );
}
