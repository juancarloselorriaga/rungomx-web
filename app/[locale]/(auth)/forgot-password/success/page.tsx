import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ArrowLeft, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ForgotPasswordSuccessPage() {
  const t = useTranslations('pages.forgotPassword');

  return (
    <AuthPageShell
      icon={<Mail className="size-5" />}
      title={t('emailSent')}
      description={t('emailSentDescription')}
    >
      <Button asChild variant="outline" className="w-full">
        <Link href="/sign-in">
          <ArrowLeft className="size-4" />
          {t('backToSignIn')}
        </Link>
      </Button>
    </AuthPageShell>
  );
}
