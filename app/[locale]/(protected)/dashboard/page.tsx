import { Button } from '@/components/ui/button';
import { InsetSurface, Surface } from '@/components/ui/surface';
import { Link } from '@/i18n/navigation';
import { getAuthContext, getSession } from '@/lib/auth/server';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { ArrowRight, CalendarDays, ShieldCheck, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard',
    (messages) => messages.Pages?.Dashboard?.metadata,
    { robots: { index: false, follow: false } },
  );
}

export default async function DashboardPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/dashboard' });
  const t = await getTranslations('pages.dashboard');
  const [session, authContext] = await Promise.all([getSession(), getAuthContext()]);
  const sessionSummary = session?.user?.email
    ? t('session.signedInAs', { email: session.user.email })
    : t('session.signedOut');
  const canAccessAthleteArea = authContext.permissions.canAccessUserArea;
  const isInternalStaff = authContext.isInternal;
  const heroDescription = canAccessAthleteArea
    ? t('description')
    : isInternalStaff
      ? t('admin.staffDescription')
      : t('admin.description');
  const workspaceTitle = isInternalStaff ? t('admin.staffTitle') : t('admin.title');

  return (
    <div className="space-y-6 sm:space-y-8">
      <Surface className="overflow-hidden border-border/60 p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)] lg:items-end">
          <div className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {heroDescription}
              </p>
            </div>

            {canAccessAthleteArea ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild>
                  <Link href="/events">
                    {t('myRegistrations.emptyState.action')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>

                <Button asChild variant="outline">
                  <Link href="/dashboard/my-registrations">{t('myRegistrations.title')}</Link>
                </Button>
              </div>
            ) : null}
          </div>

          <InsetSurface className="border-border/60 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-muted p-2 text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">{t('session.title')}</p>
                <p className="text-sm leading-6 text-muted-foreground">{sessionSummary}</p>
              </div>
            </div>
          </InsetSurface>
        </div>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-2">
        {canAccessAthleteArea ? (
          <Surface className="p-5 sm:p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-muted p-2 text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{t('myRegistrations.title')}</h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t('myRegistrations.description')}
                  </p>
                </div>
              </div>

              <Button asChild variant="outline">
                <Link href="/dashboard/my-registrations">
                  {t('myRegistrations.actions.viewDetails')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Surface>
        ) : (
          <Surface className="p-5 sm:p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-muted p-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{workspaceTitle}</h2>
                  <p className="text-sm leading-6 text-muted-foreground">{heroDescription}</p>
                </div>
              </div>
            </div>
          </Surface>
        )}

        <Surface className="p-5 sm:p-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-muted p-2 text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
              </div>

              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{t('session.title')}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{sessionSummary}</p>
              </div>
            </div>
          </div>
        </Surface>
      </div>
    </div>
  );
}
