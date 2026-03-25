import { PayoutDetailSkeleton } from '@/components/payments/payments-page-skeletons';
import { getTranslations } from 'next-intl/server';

export default async function EventPaymentsPayoutDetailLoading() {
  const t = await getTranslations('pages.dashboardPayments');
  return <PayoutDetailSkeleton loadingAriaLabel={t('detail.loadingAriaLabel')} />;
}
