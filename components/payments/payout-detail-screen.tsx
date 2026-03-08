import { Link } from '@/i18n/navigation';
import type { AppHref } from '@/lib/payments/organizer/hrefs';
import type { OrganizerPayoutDetail } from '@/lib/payments/organizer/payout-views';
import { PayoutDetailViewTelemetry } from '@/components/payments/payout-detail-view-telemetry';
import { PayoutLifecycleRail } from '@/components/payments/payout-lifecycle-rail';
import { PayoutStatementAction } from '@/components/payments/payout-statement-action';
import { PayoutStatusBadge } from '@/components/payments/payout-status-badge';

type BreadcrumbItem = {
  label: string;
  href: AppHref;
};

type PayoutDetailScreenProps = {
  locale: 'es' | 'en';
  pageTitle: string;
  description: string;
  organizationId: string;
  organizationName?: string | null;
  detail: OrganizerPayoutDetail;
  breadcrumbs: BreadcrumbItem[];
  labels: {
    status: string;
    summaryTitle: string;
    summaryDescription: string;
    requestedAmount: string;
    currentAmount: string;
    maxWithdrawable: string;
    requestedAt: string;
    technicalDetails: string;
    requestId: string;
    traceId: string;
    includedAmount: string;
    deductionAmount: string;
  };
};

function formatMoney(minor: number, currency: string, locale: 'es' | 'en'): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

function formatDate(value: Date, locale: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function PayoutDetailScreen({
  locale,
  pageTitle,
  description,
  organizationId,
  organizationName,
  detail,
  breadcrumbs,
  labels,
}: PayoutDetailScreenProps) {
  return (
    <div className="space-y-6">
      <PayoutDetailViewTelemetry
        organizationId={organizationId}
        payoutRequestId={detail.payoutRequestId}
      />

      <div className="space-y-3">
        <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {breadcrumbs.map((item, index) => (
            <div key={`${item.href}-${item.label}`} className="flex items-center gap-2">
              {index > 0 ? <span>/</span> : null}
              <Link href={item.href} className="transition hover:text-foreground">
                {item.label}
              </Link>
            </div>
          ))}
        </nav>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">{pageTitle}</h1>
            <PayoutStatusBadge status={detail.status} label={labels.status} />
          </div>
          <p className="text-muted-foreground">{description}</p>
        </div>
      </div>

      <section className="rounded-xl border bg-card/80 p-6 shadow-sm space-y-5">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">{labels.summaryTitle}</h2>
          <p className="text-sm text-muted-foreground">{labels.summaryDescription}</p>
          {organizationName ? <p className="text-sm text-muted-foreground">{organizationName}</p> : null}
        </div>

        <dl className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">{labels.requestedAmount}</dt>
            <dd className="font-medium">
              {formatMoney(detail.requestedAmountMinor, detail.currency, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{labels.currentAmount}</dt>
            <dd className="font-medium">
              {formatMoney(detail.currentRequestedAmountMinor, detail.currency, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{labels.maxWithdrawable}</dt>
            <dd className="font-medium">
              {formatMoney(detail.maxWithdrawableAmountMinor, detail.currency, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{labels.requestedAt}</dt>
            <dd className="font-medium">{formatDate(detail.requestedAt, locale)}</dd>
          </div>
        </dl>

        <details className="rounded-lg border bg-background/70 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            {labels.technicalDetails}
          </summary>
          <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{labels.requestId}</dt>
              <dd className="font-mono text-xs break-all">{detail.payoutRequestId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{labels.traceId}</dt>
              <dd className="font-mono text-xs break-all">{detail.traceId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{labels.includedAmount}</dt>
              <dd className="font-medium">
                {formatMoney(detail.includedAmountMinor, detail.currency, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{labels.deductionAmount}</dt>
              <dd className="font-medium">
                {formatMoney(detail.deductionAmountMinor, detail.currency, locale)}
              </dd>
            </div>
          </dl>
        </details>
      </section>

      <PayoutLifecycleRail locale={locale} events={detail.lifecycleEvents} />
      <PayoutStatementAction
        locale={locale}
        organizationId={organizationId}
        payoutRequestId={detail.payoutRequestId}
        isTerminal={detail.isTerminal}
      />
    </div>
  );
}
