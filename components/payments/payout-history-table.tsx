'use client';

import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { getPayoutDetailHref } from '@/lib/payments/organizer/hrefs';
import type { OrganizerPayoutListItem } from '@/lib/payments/organizer/payout-views';
import { shortIdentifier } from '@/lib/payments/organizer/presentation';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { useTranslations } from 'next-intl';
import { ChevronRightIcon } from 'lucide-react';

import {
  PaymentsDataTable,
  PaymentsDataTableCell,
  PaymentsDataTableHead,
  PaymentsDataTableHeader,
  PaymentsDataTableMeta,
  PaymentsDataTableRow,
} from './payments-data-table';
import { PaymentsStatePanel } from './payments-state-panel';
import { PayoutStatusBadge } from './payout-status-badge';
import { PaymentsMutedPanel, PaymentsPanel } from './payments-surfaces';
import {
  PaymentsSectionDescription,
  PaymentsSectionTitle,
} from './payments-typography';

type PayoutHistoryHref = Parameters<typeof Link>[0]['href'];

type PayoutHistoryTableProps = {
  items: OrganizerPayoutListItem[];
  locale: 'es' | 'en';
  title?: string;
  description?: string;
  eventId?: string;
  scopeSummary?: string;
  scopeHint?: string;
  pageStatus?: string;
  firstPageHref?: PayoutHistoryHref | null;
  previousPageHref?: PayoutHistoryHref | null;
  nextPageHref?: PayoutHistoryHref | null;
  lastPageHref?: PayoutHistoryHref | null;
  firstPageLabel?: string;
  previousPageLabel?: string;
  nextPageLabel?: string;
  lastPageLabel?: string;
};

function formatDate(value: Date, locale: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function PayoutHistoryTable({
  items,
  locale,
  title,
  description,
  eventId,
  scopeSummary,
  scopeHint,
  pageStatus,
  firstPageHref,
  previousPageHref,
  nextPageHref,
  lastPageHref,
  firstPageLabel,
  previousPageLabel,
  nextPageLabel,
  lastPageLabel,
}: PayoutHistoryTableProps) {
  const t = useTranslations('pages.dashboardPayments');
  const router = useRouter();

  if (items.length === 0) {
    return (
      <PaymentsStatePanel
        title={title ?? t('payouts.historyTitle')}
        description={description ?? t('payouts.emptyDescription')}
        dashed
        className="bg-card/80"
      >
        <div className="rounded-lg border border-dashed bg-background/70 p-6 text-sm text-muted-foreground">
          {t('payouts.emptyTitle')}
        </div>
      </PaymentsStatePanel>
    );
  }

  return (
    <PaymentsPanel className="space-y-4">
      {title || description || scopeSummary || pageStatus || scopeHint ? (
        <div className="space-y-3">
          {title || description ? (
            <div className="space-y-1.5">
              {title ? <PaymentsSectionTitle compact>{title}</PaymentsSectionTitle> : null}
              {description ? <PaymentsSectionDescription>{description}</PaymentsSectionDescription> : null}
            </div>
          ) : null}
          {scopeSummary || pageStatus || scopeHint ? (
            <PaymentsMutedPanel className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                {scopeSummary ? <p className="font-medium text-foreground">{scopeSummary}</p> : null}
                {scopeHint ? <p>{scopeHint}</p> : null}
              </div>
              {pageStatus ? <p className="text-xs uppercase tracking-[0.16em]">{pageStatus}</p> : null}
            </PaymentsMutedPanel>
          ) : null}
        </div>
      ) : null}

      <PaymentsDataTable minWidthClassName="min-w-[48rem]">
          <PaymentsDataTableHead>
            <tr>
              <PaymentsDataTableHeader>{t('payouts.table.requestId')}</PaymentsDataTableHeader>
              <PaymentsDataTableHeader>{t('payouts.table.status')}</PaymentsDataTableHeader>
              <PaymentsDataTableHeader align="right">
                {t('payouts.table.requested')}
              </PaymentsDataTableHeader>
              <PaymentsDataTableHeader align="right">
                {t('payouts.table.currentAmount')}
              </PaymentsDataTableHeader>
              <PaymentsDataTableHeader>{t('payouts.table.requestedAt')}</PaymentsDataTableHeader>
              <PaymentsDataTableHeader align="right" className="w-12">
                {t('payouts.table.open')}
              </PaymentsDataTableHeader>
            </tr>
          </PaymentsDataTableHead>
          <tbody>
            {items.map((item) => {
              const detailHref = getPayoutDetailHref(item.payoutRequestId, { eventId });
              const navigateToDetail = () =>
                router.push(detailHref as Parameters<typeof router.push>[0]);

              return (
                <PaymentsDataTableRow
                  key={item.payoutRequestId}
                  className="cursor-pointer transition hover:bg-muted/15"
                  role="link"
                  tabIndex={0}
                  onClick={navigateToDetail}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigateToDetail();
                    }
                  }}
                >
                  <PaymentsDataTableCell>
                    <Link
                      href={detailHref}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {t('payouts.table.requestLabel', { id: shortIdentifier(item.payoutRequestId) })}
                    </Link>
                    <PaymentsDataTableMeta className="font-mono">
                      {shortIdentifier(item.payoutRequestId)}
                    </PaymentsDataTableMeta>
                  </PaymentsDataTableCell>
                  <PaymentsDataTableCell>
                    <PayoutStatusBadge
                      status={item.status}
                      label={t(`payouts.statuses.${item.status}`)}
                    />
                  </PaymentsDataTableCell>
                  <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                    {formatMoneyFromMinor(item.requestedAmountMinor, item.currency, locale)}
                  </PaymentsDataTableCell>
                  <PaymentsDataTableCell align="right" className="tabular-nums whitespace-nowrap">
                    {formatMoneyFromMinor(
                      item.currentRequestedAmountMinor,
                      item.currency,
                      locale,
                    )}
                  </PaymentsDataTableCell>
                  <PaymentsDataTableCell className="whitespace-nowrap">
                    {formatDate(item.requestedAt, locale)}
                  </PaymentsDataTableCell>
                  <PaymentsDataTableCell align="right">
                    <Link
                      href={detailHref}
                      aria-label={t('actions.openDetails')}
                      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ChevronRightIcon className="size-4" />
                    </Link>
                  </PaymentsDataTableCell>
                </PaymentsDataTableRow>
              );
            })}
          </tbody>
      </PaymentsDataTable>

      {firstPageLabel && previousPageLabel && nextPageLabel && lastPageLabel ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button asChild={Boolean(firstPageHref)} variant="outline" size="sm" disabled={!firstPageHref}>
            {firstPageHref ? <Link href={firstPageHref}>{firstPageLabel}</Link> : <span>{firstPageLabel}</span>}
          </Button>
          <Button
            asChild={Boolean(previousPageHref)}
            variant="outline"
            size="sm"
            disabled={!previousPageHref}
          >
            {previousPageHref ? (
              <Link href={previousPageHref}>{previousPageLabel}</Link>
            ) : (
              <span>{previousPageLabel}</span>
            )}
          </Button>
          <Button asChild={Boolean(nextPageHref)} variant="outline" size="sm" disabled={!nextPageHref}>
            {nextPageHref ? <Link href={nextPageHref}>{nextPageLabel}</Link> : <span>{nextPageLabel}</span>}
          </Button>
          <Button asChild={Boolean(lastPageHref)} variant="outline" size="sm" disabled={!lastPageHref}>
            {lastPageHref ? <Link href={lastPageHref}>{lastPageLabel}</Link> : <span>{lastPageLabel}</span>}
          </Button>
        </div>
      ) : null}
    </PaymentsPanel>
  );
}
