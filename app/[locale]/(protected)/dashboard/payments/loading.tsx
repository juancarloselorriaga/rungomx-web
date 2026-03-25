import { PaymentsWorkspaceSkeleton } from '@/components/payments/payments-page-skeletons';
import { getTranslations } from 'next-intl/server';

export default async function DashboardPaymentsLoading() {
  const t = await getTranslations('pages.dashboardPayments');
  return <PaymentsWorkspaceSkeleton loadingAriaLabel={t('home.shell.loadingAriaLabel')} />;
}
