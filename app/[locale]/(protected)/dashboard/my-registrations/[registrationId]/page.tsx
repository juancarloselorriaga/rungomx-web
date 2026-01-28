import { Badge } from '@/components/common/badge';
import { DemoPayButton } from '@/components/dashboard/demo-pay-button';
import { PrintButton } from '@/components/dashboard/print-button';
import { Button } from '@/components/ui/button';
import { getPathname, Link } from '@/i18n/navigation';
import { DEFAULT_TIMEZONE } from '@/i18n/routing';
import { getAuthContext } from '@/lib/auth/server';
import { getMyRegistrationDetail } from '@/lib/events/queries';
import { formatRegistrationTicketCode } from '@/lib/events/tickets';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { Calendar, MapPin, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

const CURRENCY = 'MXN';

type RegistrationDetailPageProps = LocalePageProps & {
  params: Promise<{ locale: string; registrationId: string }>;
};

export async function generateMetadata({ params }: RegistrationDetailPageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/dashboard/my-registrations/[registrationId]',
    (messages) => messages.Pages?.DashboardMyRegistrationDetail?.metadata,
    { robots: { index: false, follow: false } },
  );
}

function formatDateTime(date: Date | null, locale: string, timezone?: string | null) {
  if (!date) return '-';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone || DEFAULT_TIMEZONE,
  }).format(date);
}

function formatCurrency(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function MyRegistrationDetailPage({ params }: RegistrationDetailPageProps) {
  const { locale, registrationId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/my-registrations/[registrationId]' });
  const t = await getTranslations('pages.dashboard.myRegistrations');
  const authContext = await getAuthContext();
  const vercelEnv = process.env.VERCEL_ENV;
  const isVercelProduction = vercelEnv ? vercelEnv === 'production' : false;
  const isNonVercelProduction = !vercelEnv && process.env.NODE_ENV === 'production';
  const isProduction = isVercelProduction || isNonVercelProduction;
  const allowDemoPaymentsInProduction =
    process.env.EVENTS_DEMO_PAYMENTS_ALLOW_PRODUCTION === 'true';
  const demoPaymentsEnabled =
    process.env.NEXT_PUBLIC_FEATURE_EVENTS_DEMO_PAYMENTS === 'true' &&
    (!isProduction || allowDemoPaymentsInProduction);

  if (!authContext.permissions.canAccessUserArea) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  const detail = await getMyRegistrationDetail(authContext.user!.id, registrationId);
  if (!detail) {
    notFound();
  }

  const { registration, event, distance, registrant, waiverAcceptances } = detail;
  const ticketCode = formatRegistrationTicketCode(registration.id);
  const qrUrl = `/api/tickets/qr/${registration.id}`;
  const isExpired =
    (registration.status === 'started' || registration.status === 'submitted') &&
    registration.expiresAt &&
    registration.expiresAt <= new Date();
  const statusLabels = {
    confirmed: 'green',
    payment_pending: 'blue',
    cancelled: 'outline',
    started: 'indigo',
    submitted: 'indigo',
    expired: 'outline',
  } as const;
  const statusCopy = {
    confirmed: t('status.confirmed'),
    payment_pending: t('status.payment_pending'),
    cancelled: t('status.cancelled'),
    started: t('status.started'),
    submitted: t('status.submitted'),
    expired: t('status.expired'),
  } as const;
  type StatusKey = keyof typeof statusLabels;
  const statusKey = (isExpired ? 'expired' : registration.status) as StatusKey;
  const statusVariant = statusLabels[statusKey] ?? 'default';
  const statusLabel = statusCopy[statusKey];

  const location = event.locationDisplay || [event.city, event.state].filter(Boolean).join(', ');
  const hasPriceDetails =
    registration.basePriceCents !== null ||
    registration.feesCents !== null ||
    registration.taxCents !== null ||
    registration.totalCents !== null;

  const snapshot = registrant?.profileSnapshot ?? {};
  const participantFields = [
    [t('labels.fields.firstName'), snapshot.firstName],
    [t('labels.fields.lastName'), snapshot.lastName],
    [t('labels.fields.email'), snapshot.email],
    [t('labels.fields.phone'), snapshot.phone],
    [t('labels.fields.dateOfBirth'), snapshot.dateOfBirth],
    [t('labels.fields.gender'), snapshot.gender],
    [t('labels.fields.city'), snapshot.city],
    [t('labels.fields.state'), snapshot.state],
    [t('labels.fields.country'), snapshot.country],
    [t('labels.fields.emergencyContactName'), snapshot.emergencyContactName],
    [t('labels.fields.emergencyContactPhone'), snapshot.emergencyContactPhone],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  const signatureLabels = {
    checkbox: t('detail.signatureTypes.checkbox'),
    initials: t('detail.signatureTypes.initials'),
    signature: t('detail.signatureTypes.signature'),
  } as const;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/my-registrations"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          {t('title')}
        </Link>
        <h1 className="text-3xl font-bold">
          {event.seriesName} {event.editionLabel}
        </h1>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">{t('labels.ticket')}</h2>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('labels.ticketCode')}</p>
              <p className="text-2xl font-bold tracking-widest">{ticketCode}</p>
              <p className="text-xs text-muted-foreground">
                {t('labels.supportId')}: {registration.id}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">{t('detail.ticketNote')}</p>
            {registration.status === 'payment_pending' ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('detail.paymentPendingNote')}</p>
                {demoPaymentsEnabled ? (
                  <p className="text-xs text-muted-foreground">{t('detail.demoPayNote')}</p>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <PrintButton label={t('actions.print')} />
              {registration.status === 'payment_pending' ? (
                demoPaymentsEnabled ? (
                  <DemoPayButton registrationId={registration.id} />
                ) : (
                  <Button type="button" disabled>
                    {t('actions.payNow')}
                  </Button>
                )
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-center rounded-lg border bg-muted/20 p-4">
            <Image
              src={qrUrl}
              alt={t('labels.ticketCode')}
              width={160}
              height={160}
              className="h-40 w-40"
              unoptimized
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold">{t('labels.eventDetails')}</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>{formatDateTime(event.startsAt, locale, event.timezone)}</span>
            </div>
            {location ? (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{location}</span>
              </div>
            ) : null}
            {event.address ? <p>{event.address}</p> : null}
            <p>
              {t('labels.distance')}: {distance.label}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link
                href={{
                  pathname: '/events/[seriesSlug]/[editionSlug]',
                  params: { seriesSlug: event.seriesSlug, editionSlug: event.editionSlug },
                }}
              >
                {t('detail.eventLink')}
              </Link>
            </Button>
            {event.externalUrl ? (
              <Button asChild variant="ghost">
                <a href={event.externalUrl} target="_blank" rel="noreferrer">
                  {t('detail.officialSite')}
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold">{t('labels.registrationDetails')}</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              {t('labels.createdAt')}: {formatDateTime(registration.createdAt, locale)}
            </p>
            {registration.status === 'payment_pending' && registration.expiresAt ? (
              <p>
                {t('labels.paymentHoldExpires')}: {formatDateTime(registration.expiresAt, locale)}
              </p>
            ) : null}
          </div>
          {hasPriceDetails ? (
            <div className="space-y-2 text-sm">
              <p className="font-semibold">{t('labels.priceBreakdown')}</p>
              <div className="space-y-1 text-muted-foreground">
                {registration.basePriceCents !== null ? (
                  <div className="flex items-center justify-between">
                    <span>{t('labels.basePrice')}</span>
                    <span>{formatCurrency(registration.basePriceCents, locale)}</span>
                  </div>
                ) : null}
                {registration.feesCents !== null ? (
                  <div className="flex items-center justify-between">
                    <span>{t('labels.fees')}</span>
                    <span>{formatCurrency(registration.feesCents, locale)}</span>
                  </div>
                ) : null}
                {registration.taxCents !== null ? (
                  <div className="flex items-center justify-between">
                    <span>{t('labels.tax')}</span>
                    <span>{formatCurrency(registration.taxCents, locale)}</span>
                  </div>
                ) : null}
                {registration.totalCents !== null ? (
                  <div className="flex items-center justify-between font-semibold text-foreground">
                    <span>{t('labels.total')}</span>
                    <span>{formatCurrency(registration.totalCents, locale)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">{t('labels.participantSnapshot')}</h3>
          </div>
          {participantFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">-</p>
          ) : (
            <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              {participantFields.map(([label, value]) => (
                <div key={label} className="space-y-1">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold">{t('labels.waivers')}</h3>
          {waiverAcceptances.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('detail.noWaivers')}</p>
          ) : (
            <div className="space-y-3 text-sm">
              {waiverAcceptances.map((waiver) => (
                <div key={`${waiver.title}-${waiver.acceptedAt.toISOString()}`} className="rounded-md border px-3 py-2">
                  <p className="font-medium text-foreground">{waiver.title}</p>
                  <div className="text-muted-foreground text-xs space-y-1">
                    <p>
                      {t('detail.waiverAccepted')}: {formatDateTime(waiver.acceptedAt, locale)}
                    </p>
                    <p>
                      {t('detail.waiverSignature')}: {signatureLabels[waiver.signatureType as keyof typeof signatureLabels]}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
