import { Button } from '@/components/ui/button';
import { getPathname } from '@/i18n/navigation';
import { LogIn, UserPlus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

type LoginRequiredProps = {
  locale: string;
  seriesSlug: string;
  editionSlug: string;
  uploadToken: string;
  eventName: string;
};

export async function GroupUploadLoginRequired({
  locale,
  seriesSlug,
  editionSlug,
  uploadToken,
  eventName,
}: LoginRequiredProps) {
  const t = await getTranslations({
    locale: locale as 'es' | 'en',
    namespace: 'pages.events.groupUpload.loginRequired',
  });

  const groupUploadPath = getPathname({
    href: {
      pathname: '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]',
      params: { seriesSlug, editionSlug, uploadToken },
    },
    locale: locale as 'es' | 'en',
  });

  const signInPath = getPathname({ href: '/sign-in', locale: locale as 'es' | 'en' });
  const signUpPath = getPathname({ href: '/sign-up', locale: locale as 'es' | 'en' });

  const callbackPath = groupUploadPath.startsWith(`/${locale}/`)
    ? groupUploadPath.slice(locale.length + 1)
    : groupUploadPath;

  const signInUrl = `${signInPath}?callbackURL=${encodeURIComponent(callbackPath)}`;
  const signUpUrl = `${signUpPath}?callbackURL=${encodeURIComponent(callbackPath)}`;

  return (
    <div className="container mx-auto px-4 py-16 max-w-lg">
      <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <LogIn className="h-8 w-8 text-primary" />
        </div>

        <h1 className="text-2xl font-bold mb-2">{t('title')}</h1>
        <p className="text-muted-foreground mb-2">{t('description')}</p>
        <p className="text-sm text-muted-foreground mb-6">{eventName}</p>

        <div className="flex flex-col gap-3">
          <Button asChild size="lg">
            <a href={signInUrl}>
              <LogIn className="h-4 w-4 mr-2" />
              {t('signIn')}
            </a>
          </Button>
          <Button variant="outline" asChild size="lg">
            <a href={signUpUrl}>
              <UserPlus className="h-4 w-4 mr-2" />
              {t('signUp')}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
