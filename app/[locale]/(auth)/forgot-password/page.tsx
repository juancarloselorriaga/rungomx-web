import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

export default function ForgotPasswordPage() {
  const t = useTranslations('pages.forgotPassword');

  return (
    <div className="space-y-6 rounded-lg border bg-card p-8 shadow-lg">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <ForgotPasswordForm />

      <p className="text-center text-sm">
        <Link href="/sign-in" className="text-primary hover:underline">
          {t('backToSignIn')}
        </Link>
      </p>
    </div>
  );
}
