import { PaymentsWorkspaceSkeleton } from '@/components/payments/payments-page-skeletons';
import { getTranslations } from 'next-intl/server';

export default async function EventPaymentsLoading() {
  const t = await getTranslations('pages.dashboardPayments');
  return (
    <PaymentsWorkspaceSkeleton
      showContextCard={false}
      loadingAriaLabel={t('home.shell.loadingAriaLabel')}
    />
  );
}
