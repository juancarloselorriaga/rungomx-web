'use client';

import { PublicLoginRequiredShell } from '@/components/auth/public-login-required-shell';
import { PublicStatusShell } from '@/components/common';
import {
  publicBodyTextClassName,
  publicMutedPanelClassName,
  publicPanelClassName,
  publicStatusPillClassName,
  publicSummaryItemClassName,
} from '@/components/common/public-form-styles';
import { Button } from '@/components/ui/button';
import { createBatchViaLink } from '@/lib/events/group-upload/actions';
import { cn } from '@/lib/utils';
import { FileDown, Loader2, MapPin, Upload } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/navigation';

type DistanceOption = {
  id: string;
  label: string;
  spotsRemaining: number | null;
};

type GroupUploadLandingProps = {
  uploadToken: string;
  status: string;
  isAuthenticated: boolean;
  signInUrl?: string;
  signUpUrl?: string;
  event: {
    editionId: string;
    editionSlug: string;
    editionLabel: string;
    seriesSlug: string;
    seriesName: string;
    startsAt: string | null;
    endsAt: string | null;
    timezone?: string | null;
    locationDisplay?: string | null;
    city?: string | null;
    state?: string | null;
  };
  distances: DistanceOption[];
  usage: {
    batchCount: number;
    inviteCount: number;
  };
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-600',
  NOT_STARTED: 'bg-amber-500/10 text-amber-600',
  EXPIRED: 'bg-muted text-muted-foreground',
  REVOKED: 'bg-red-500/10 text-red-600',
  DISABLED: 'bg-muted text-muted-foreground',
  MAXED_OUT: 'bg-amber-500/10 text-amber-600',
  NOT_FOUND: 'bg-muted text-muted-foreground',
};

const TEMPLATE_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'dateOfBirth',
  'phone',
  'gender',
  'genderIdentity',
  'city',
  'state',
  'country',
  'emergencyContactName',
  'emergencyContactPhone',
];

const TEMPLATE_EXAMPLE = [
  'Ana',
  'Perez',
  'ana.perez@example.com',
  '1990-01-15',
  '',
  '',
  '',
  '',
  '',
  'MX',
  '',
  '',
];

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function GroupUploadLanding({
  uploadToken,
  status,
  isAuthenticated,
  signInUrl,
  signUpUrl,
  event,
  distances,
  usage,
}: GroupUploadLandingProps) {
  const t = useTranslations('pages.events.groupUpload');
  const locale = useLocale();
  const router = useRouter();
  const [selectedDistanceId, setSelectedDistanceId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const statusLabelMap: Record<string, string> = {
    ACTIVE: t('status.ACTIVE'),
    NOT_STARTED: t('status.NOT_STARTED'),
    EXPIRED: t('status.EXPIRED'),
    REVOKED: t('status.REVOKED'),
    DISABLED: t('status.DISABLED'),
    MAXED_OUT: t('status.MAXED_OUT'),
    NOT_FOUND: t('status.NOT_FOUND'),
  };
  const statusLabel = statusLabelMap[status] ?? status;
  const canCreateBatch = status === 'ACTIVE' && isAuthenticated;
  const showStatusHelp = status !== 'ACTIVE';

  const eventDate = useMemo(() => {
    if (!event.startsAt) return null;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: event.timezone ?? undefined,
    }).format(new Date(event.startsAt));
  }, [event.startsAt, event.timezone, locale]);

  const locationLabel =
    event.locationDisplay || [event.city, event.state].filter(Boolean).join(', ');

  const handleDownloadTemplate = () => {
    const csv = `${TEMPLATE_HEADERS.join(',')}\n${TEMPLATE_EXAMPLE.join(',')}\n`;
    downloadCsv(csv, 'group-upload-template.csv');
    toast.success(t('template.downloaded'));
  };

  const handleCreateBatch = () => {
    if (!isAuthenticated) {
      if (signInUrl) {
        window.location.href = signInUrl;
        return;
      }
      toast.error(t('loginRequired.description'));
      return;
    }

    if (!selectedDistanceId) {
      toast.error(t('errors.distanceRequired'));
      return;
    }

    startTransition(async () => {
      const result = await createBatchViaLink({ uploadToken, distanceId: selectedDistanceId });

      if (!result.ok) {
        toast.error(t('errors.createBatch'), { description: result.error });
        return;
      }

      const batchId = result.data.batchId;
      router.push({
        pathname: '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]/batches/[batchId]',
        params: {
          seriesSlug: event.seriesSlug,
          editionSlug: event.editionSlug,
          uploadToken,
          batchId,
        },
      });
    });
  };

  return (
    <div className="space-y-6">
      {!isAuthenticated && signInUrl && signUpUrl ? (
        <PublicLoginRequiredShell
          title={t('loginRequired.title')}
          description={t('loginRequired.description')}
          eventName={`${event.seriesName} ${event.editionLabel}`}
          signInLabel={t('loginRequired.signIn')}
          signUpLabel={t('loginRequired.signUp')}
          signInUrl={signInUrl}
          signUpUrl={signUpUrl}
        />
      ) : null}

      <PublicStatusShell
        badge="RunGoMX"
        icon={<Upload className="h-5 w-5" />}
        title={t('title')}
        description={t('description')}
        context={
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn(publicStatusPillClassName, STATUS_STYLES[status])}>
                {statusLabel}
              </span>
            </div>
            <div className={cn(publicMutedPanelClassName, 'space-y-3 p-4 sm:p-5')}>
              <div className="font-display text-[1.45rem] font-medium tracking-[-0.03em] text-foreground">
                {event.seriesName} {event.editionLabel}
              </div>
              {eventDate ? <div className={publicBodyTextClassName}>{eventDate}</div> : null}
              {locationLabel ? (
                <div className="flex items-center gap-2 text-sm leading-7 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {locationLabel}
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={publicSummaryItemClassName}>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t('template.title')}
                </p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {t('usage', { batches: usage.batchCount, invites: usage.inviteCount })}
                </p>
              </div>
              <div className={publicSummaryItemClassName}>
                <Button variant="outline" onClick={handleDownloadTemplate} className="w-full">
                  <FileDown className="mr-2 h-4 w-4" />
                  {t('template.download')}
                </Button>
              </div>
            </div>
          </div>
        }
        surfaceClassName="max-w-4xl"
      >
        <section className="space-y-5">
          <div className="space-y-2 text-left">
            <h2 className="font-display text-[clamp(1.55rem,2.7vw,2.05rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
              {t('create.title')}
            </h2>
            <p className={publicBodyTextClassName}>{t('create.description')}</p>
          </div>

          <div className={cn(publicMutedPanelClassName, 'space-y-3 p-4 sm:p-5')}>
            <h3 className="font-medium text-foreground">{t('template.title')}</h3>
            <p className={publicBodyTextClassName}>{t('template.description')}</p>
          </div>

          <div className={cn(publicPanelClassName, 'space-y-4')}>
            <p className="text-sm font-medium">{t('create.distanceLabel')}</p>
            <div className="grid gap-3">
              {distances.map((distance) => (
                <button
                  key={distance.id}
                  type="button"
                  className={cn(
                    'flex items-center justify-between gap-4 rounded-[1.35rem] border px-4 py-4 text-left transition sm:px-5',
                    selectedDistanceId === distance.id
                      ? 'border-primary bg-primary/5 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.85)]'
                      : 'border-border/55 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] hover:border-primary/35',
                  )}
                  onClick={() => setSelectedDistanceId(distance.id)}
                  disabled={!canCreateBatch}
                >
                  <div>
                    <div className="font-display text-[1.25rem] font-medium tracking-[-0.025em] text-foreground">
                      {distance.label}
                    </div>
                    {distance.spotsRemaining !== null ? (
                      <div className="mt-1 text-xs leading-6 text-muted-foreground">
                        {t('create.spotsRemaining', { count: distance.spotsRemaining })}
                      </div>
                    ) : null}
                  </div>
                  {selectedDistanceId === distance.id ? (
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                      {t('create.selected')}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className={cn(publicPanelClassName, 'space-y-4')}>
            <Button
              onClick={handleCreateBatch}
              disabled={!canCreateBatch || !selectedDistanceId || isPending}
              className="w-full sm:w-auto"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {t('create.action')}
            </Button>

            {showStatusHelp ? (
              <div
                className={cn(
                  publicMutedPanelClassName,
                  'p-4 text-sm text-muted-foreground sm:p-5',
                )}
              >
                {status === 'NOT_STARTED'
                  ? t('statusHelp.NOT_STARTED')
                  : status === 'EXPIRED'
                    ? t('statusHelp.EXPIRED')
                    : status === 'REVOKED'
                      ? t('statusHelp.REVOKED')
                      : status === 'DISABLED'
                        ? t('statusHelp.DISABLED')
                        : status === 'MAXED_OUT'
                          ? t('statusHelp.MAXED_OUT')
                          : t('statusHelp.generic')}
              </div>
            ) : null}
          </div>
        </section>
      </PublicStatusShell>
    </div>
  );
}
