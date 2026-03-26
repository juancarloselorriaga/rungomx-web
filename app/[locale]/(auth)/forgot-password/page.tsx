import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { Link } from '@/i18n/navigation';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ForgotPasswordPage() {
  const t = useTranslations('pages.forgotPassword');

  return (
    <AuthPageShell
      icon={<Mail className="size-5" />}
      title={t('title')}
      description={t('description')}
      footer={
        <p className="border-t border-border/60 pt-5 text-center text-sm">
          <Link href="/sign-in" className="font-semibold text-primary hover:underline">
            {t('backToSignIn')}
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthPageShell>
  );
}
