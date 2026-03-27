import { RegistrationTicketStatus } from '@/components/dashboard/registration-ticket-status';
import { DashboardPageIntro, DashboardPageIntroMeta } from '@/components/dashboard/page-intro';
import { DashboardSectionSurface } from '@/components/dashboard/dashboard-section-surface';
import { Button } from '@/components/ui/button';
import { InsetSurface, Surface } from '@/components/ui/surface';
import { getPathname, Link } from '@/i18n/navigation';
import { DEFAULT_TIMEZONE } from '@/i18n/routing';
import { getAuthContext } from '@/lib/auth/server';
import type { MyRegistrationStatusKey } from '@/lib/events/my-registrations';
import { getMyRegistrationDetail } from '@/lib/events/queries';
import { formatRegistrationTicketCode } from '@/lib/events/tickets';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { Calendar, MapPin, QrCode, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';

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
  return formatMoneyFromMinor(cents, CURRENCY, locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function DetailSection({
  title,
  description,
  icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DashboardSectionSurface
      title={title}
      description={description}
      headerIcon={icon}
      className={className}
      contentClassName="space-y-4"
    >
      {children}
    </DashboardSectionSurface>
  );
}

function DetailRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 ${emphasize ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
    >
      <span>{label}</span>
      <span className={`text-right ${emphasize ? 'text-foreground' : 'text-foreground/90'}`}>
        {value}
      </span>
    </div>
  );
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
    redirect(
      getPathname({
        href:
          authContext.isInternal && authContext.permissions.canAccessAdminArea
            ? '/admin'
            : '/dashboard',
        locale,
      }),
    );
  }

  const detail = await getMyRegistrationDetail(authContext.user!.id, registrationId);
  if (!detail) {
    notFound();
  }

  const registrationDetail = detail;
  const { registration, event, distance, registrant, waiverAcceptances } = registrationDetail;
  const ticketCode = formatRegistrationTicketCode(registration.id);
  const qrUrl = `/api/tickets/qr/${registration.id}`;
  const statusCopy: Record<MyRegistrationStatusKey, string> = {
    confirmed: t('status.confirmed'),
    payment_pending: t('status.payment_pending'),
    cancelled: t('status.cancelled'),
    started: t('status.started'),
    submitted: t('status.submitted'),
    expired: t('status.expired'),
  };
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
      <DashboardPageIntro
        title={`${event.seriesName} ${event.editionLabel}`}
        description={distance.label}
        eyebrow={t('title')}
        actions={
          <Button asChild variant="outline">
            <Link href="/dashboard/my-registrations">{t('title')}</Link>
          </Button>
        }
        aside={
          <DashboardPageIntroMeta
            eyebrow={t('labels.ticket')}
            title={ticketCode}
            items={[
              {
                label: t('labels.eventDate'),
                value: formatDateTime(event.startsAt, locale, event.timezone),
              },
              ...(location ? [{ label: t('labels.location'), value: location }] : []),
            ]}
            className="bg-background/72"
          />
        }
      />

      <Surface className="overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_320px]">
          <div className="p-6 sm:p-7">
            <RegistrationTicketStatus
              registrationId={registration.id}
              initialStatus={registration.statusKey}
              statusLabels={statusCopy}
              ticketTitle={t('labels.ticket')}
              ticketCodeLabel={t('labels.ticketCode')}
              ticketCode={ticketCode}
              supportIdLabel={t('labels.supportId')}
              ticketNote={t('detail.ticketNote')}
              paymentPendingNote={t('detail.paymentPendingNote')}
              demoPayNote={t('detail.demoPayNote')}
              demoPaymentsEnabled={demoPaymentsEnabled}
              printLabel={t('actions.print')}
              payNowLabel={t('actions.payNow')}
            />
          </div>
          <div className="border-t bg-muted/20 p-6 lg:border-l lg:border-t-0 lg:p-7">
            <InsetSurface className="flex h-full flex-col items-center justify-center gap-4 p-5 text-center">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <QrCode className="h-4 w-4" />
                {t('labels.ticket')}
              </div>
              <Image
                src={qrUrl}
                alt={t('labels.ticketCode')}
                width={176}
                height={176}
                className="h-44 w-44"
                unoptimized
              />
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {t('labels.ticketCode')}
                </p>
                <p className="font-mono text-sm text-foreground">{ticketCode}</p>
              </div>
            </InsetSurface>
          </div>
        </div>
      </Surface>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection
          title={t('labels.eventDetails')}
          description={distance.label}
          icon={<Calendar className="h-5 w-5" />}
        >
          <InsetSurface className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{formatDateTime(event.startsAt, locale, event.timezone)}</span>
            </div>
            {location ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{location}</span>
              </div>
            ) : null}
            {event.address ? <p className="text-muted-foreground">{event.address}</p> : null}
            <DetailRow label={t('labels.distance')} value={distance.label} />
          </InsetSurface>
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
        </DetailSection>

        <DetailSection title={t('labels.registrationDetails')} description={t('detail.ticketNote')}>
          <InsetSurface className="space-y-3 text-sm">
            <DetailRow
              label={t('labels.createdAt')}
              value={formatDateTime(registration.createdAt, locale)}
            />
            {registration.status === 'payment_pending' && registration.expiresAt ? (
              <DetailRow
                label={t('labels.paymentHoldExpires')}
                value={formatDateTime(registration.expiresAt, locale)}
              />
            ) : null}
          </InsetSurface>
          {hasPriceDetails ? (
            <InsetSurface className="space-y-3 text-sm">
              <p className="font-semibold text-foreground">{t('labels.priceBreakdown')}</p>
              <div className="space-y-2">
                {registration.basePriceCents !== null ? (
                  <DetailRow
                    label={t('labels.basePrice')}
                    value={formatCurrency(registration.basePriceCents, locale)}
                  />
                ) : null}
                {registration.feesCents !== null ? (
                  <DetailRow
                    label={t('labels.fees')}
                    value={formatCurrency(registration.feesCents, locale)}
                  />
                ) : null}
                {registration.taxCents !== null ? (
                  <DetailRow
                    label={t('labels.tax')}
                    value={formatCurrency(registration.taxCents, locale)}
                  />
                ) : null}
                {registration.totalCents !== null ? (
                  <DetailRow
                    label={t('labels.total')}
                    value={formatCurrency(registration.totalCents, locale)}
                    emphasize
                  />
                ) : null}
              </div>
            </InsetSurface>
          ) : null}
        </DetailSection>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection
          title={t('labels.participantSnapshot')}
          description={t('detail.ticketNote')}
          icon={<UserRound className="h-5 w-5" />}
        >
          {participantFields.length === 0 ? (
            <InsetSurface>
              <p className="text-sm text-muted-foreground">-</p>
            </InsetSurface>
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {participantFields.map(([label, value]) => (
                <InsetSurface key={label} className="space-y-1">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="text-foreground">{value}</dd>
                </InsetSurface>
              ))}
            </dl>
          )}
        </DetailSection>

        <DetailSection title={t('labels.waivers')} description={t('detail.noWaivers')}>
          {waiverAcceptances.length === 0 ? (
            <InsetSurface>
              <p className="text-sm text-muted-foreground">{t('detail.noWaivers')}</p>
            </InsetSurface>
          ) : (
            <div className="space-y-3 text-sm">
              {waiverAcceptances.map((waiver: (typeof waiverAcceptances)[number]) => (
                <InsetSurface
                  key={`${waiver.title}-${waiver.acceptedAt.toISOString()}`}
                  className="space-y-2"
                >
                  <p className="font-medium text-foreground">{waiver.title}</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>
                      {t('detail.waiverAccepted')}: {formatDateTime(waiver.acceptedAt, locale)}
                    </p>
                    <p>
                      {t('detail.waiverSignature')}:{' '}
                      {signatureLabels[waiver.signatureType as keyof typeof signatureLabels]}
                    </p>
                  </div>
                </InsetSurface>
              ))}
            </div>
          )}
        </DetailSection>
      </div>
    </div>
  );
}
