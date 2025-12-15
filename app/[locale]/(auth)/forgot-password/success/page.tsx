import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ArrowLeft, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ForgotPasswordSuccessPage() {
  const t = useTranslations('pages.forgotPassword');

  return (
    <div className="space-y-6 rounded-lg border bg-card p-8 shadow-lg text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Mail className="size-8 text-primary" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('emailSent')}</h1>
        <p className="text-muted-foreground">{t('emailSentDescription')}</p>
      </div>

      <Button asChild variant="outline" className="w-full">
        <Link href="/sign-in">
          <ArrowLeft className="size-4" />
          {t('backToSignIn')}
        </Link>
      </Button>
    </div>
  );
}
