import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { KeyRound } from 'lucide-react';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

export default function ResetPasswordPage() {
  const t = useTranslations('pages.resetPassword');
  const tCommon = useTranslations('common');

  return (
    <AuthPageShell
      icon={<KeyRound className="size-5" />}
      title={t('title')}
      description={t('description')}
    >
      <Suspense
        fallback={
          <div className="text-center text-sm text-muted-foreground">{tCommon('loading')}</div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthPageShell>
  );
}
