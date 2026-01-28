'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { CreditCard, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { demoPayRegistration } from '@/lib/events/payments/actions';

type DemoPayButtonProps = {
  registrationId: string;
};

export function DemoPayButton({ registrationId }: DemoPayButtonProps) {
  const t = useTranslations('pages.dashboard.myRegistrations');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handlePay = () => {
    startTransition(async () => {
      const result = await demoPayRegistration({ registrationId });

      if (!result.ok) {
        toast.error(t('detail.demoPayError'), { description: result.error });
        return;
      }

      toast.success(t('detail.demoPaySuccess'));
      router.refresh();
    });
  };

  return (
    <Button type="button" onClick={handlePay} disabled={isPending}>
      {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
      {t('actions.payNowDemo')}
    </Button>
  );
}

