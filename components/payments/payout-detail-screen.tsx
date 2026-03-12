import { Link } from '@/i18n/navigation';
import type { AppHref } from '@/lib/payments/organizer/hrefs';
import type { OrganizerPayoutDetail } from '@/lib/payments/organizer/payout-views';
import { PayoutDetailViewTelemetry } from '@/components/payments/payout-detail-view-telemetry';
import { PayoutLifecycleRail } from '@/components/payments/payout-lifecycle-rail';
import { PayoutStatementAction } from '@/components/payments/payout-statement-action';
import { PayoutStatusBadge } from '@/components/payments/payout-status-badge';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import {
  PaymentsMetaLabel,
  PaymentsMetricValue,
  PaymentsMonoValue,
  PaymentsSectionDescription,
  PaymentsSectionTitle,
} from './payments-typography';

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
          <PaymentsSectionDescription>{description}</PaymentsSectionDescription>
        </div>
      </div>

      <section className="rounded-xl border bg-card/80 p-6 shadow-sm space-y-5">
        <div className="space-y-2">
          <PaymentsSectionTitle>{labels.summaryTitle}</PaymentsSectionTitle>
          <PaymentsSectionDescription>{labels.summaryDescription}</PaymentsSectionDescription>
          {organizationName ? <PaymentsSectionDescription>{organizationName}</PaymentsSectionDescription> : null}
        </div>

        <dl className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div>
            <PaymentsMetaLabel>{labels.requestedAmount}</PaymentsMetaLabel>
            <dd>
              <PaymentsMetricValue compact>
              {formatMoneyFromMinor(detail.requestedAmountMinor, detail.currency, locale)}
              </PaymentsMetricValue>
            </dd>
          </div>
          <div>
            <PaymentsMetaLabel>{labels.currentAmount}</PaymentsMetaLabel>
            <dd>
              <PaymentsMetricValue compact>
              {formatMoneyFromMinor(
                detail.currentRequestedAmountMinor,
                detail.currency,
                locale,
              )}
              </PaymentsMetricValue>
            </dd>
          </div>
          <div>
            <PaymentsMetaLabel>{labels.maxWithdrawable}</PaymentsMetaLabel>
            <dd className="font-medium">
              {formatMoneyFromMinor(detail.maxWithdrawableAmountMinor, detail.currency, locale)}
            </dd>
          </div>
          <div>
            <PaymentsMetaLabel>{labels.requestedAt}</PaymentsMetaLabel>
            <dd className="font-medium">{formatDate(detail.requestedAt, locale)}</dd>
          </div>
        </dl>

        <details className="rounded-lg border bg-background/70 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            {labels.technicalDetails}
          </summary>
          <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <PaymentsMetaLabel>{labels.requestId}</PaymentsMetaLabel>
              <PaymentsMonoValue>{detail.payoutRequestId}</PaymentsMonoValue>
            </div>
            <div>
              <PaymentsMetaLabel>{labels.traceId}</PaymentsMetaLabel>
              <PaymentsMonoValue>{detail.traceId}</PaymentsMonoValue>
            </div>
            <div>
              <PaymentsMetaLabel>{labels.includedAmount}</PaymentsMetaLabel>
              <dd className="font-medium">
                {formatMoneyFromMinor(detail.includedAmountMinor, detail.currency, locale)}
              </dd>
            </div>
            <div>
              <PaymentsMetaLabel>{labels.deductionAmount}</PaymentsMetaLabel>
              <dd className="font-medium">
                {formatMoneyFromMinor(detail.deductionAmountMinor, detail.currency, locale)}
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
