import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

export default function ResetPasswordPage() {
  const t = useTranslations('pages.resetPassword');

  return (
    <div className="space-y-6 rounded-lg border bg-card p-8 shadow-lg">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <Suspense
        fallback={<div className="text-center text-sm text-muted-foreground">Loading...</div>}
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
