'use client';

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

  const locationLabel = event.locationDisplay || [event.city, event.state].filter(Boolean).join(', ');

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
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <span className={cn('rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide', STATUS_STYLES[status])}>
            {statusLabel}
          </span>
        </div>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {!isAuthenticated && signInUrl && signUpUrl ? (
        <div className="rounded-lg border bg-card p-5 shadow-sm space-y-3">
          <div>
            <h2 className="text-base font-semibold">{t('loginRequired.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('loginRequired.description')}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href={signInUrl}>{t('loginRequired.signIn')}</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={signUpUrl}>{t('loginRequired.signUp')}</a>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border bg-card p-5 shadow-sm space-y-3">
        <div className="text-lg font-semibold">
          {event.seriesName} {event.editionLabel}
        </div>
        {eventDate ? <div className="text-sm text-muted-foreground">{eventDate}</div> : null}
        {locationLabel ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {locationLabel}
          </div>
        ) : null}
        <div className="text-xs text-muted-foreground">
          {t('usage', { batches: usage.batchCount, invites: usage.inviteCount })}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t('template.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('template.description')}</p>
        </div>
        <Button variant="outline" onClick={handleDownloadTemplate} className="w-full sm:w-auto">
          <FileDown className="h-4 w-4 mr-2" />
          {t('template.download')}
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t('create.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('create.description')}</p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">{t('create.distanceLabel')}</p>
          <div className="grid gap-2">
            {distances.map((distance) => (
              <button
                key={distance.id}
                type="button"
                className={cn(
                  'flex items-center justify-between rounded-md border px-4 py-3 text-left transition',
                  selectedDistanceId === distance.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background hover:border-primary/40',
                )}
                onClick={() => setSelectedDistanceId(distance.id)}
                disabled={!canCreateBatch}
              >
                <div>
                  <div className="font-medium">{distance.label}</div>
                  {distance.spotsRemaining !== null ? (
                    <div className="text-xs text-muted-foreground">
                      {t('create.spotsRemaining', { count: distance.spotsRemaining })}
                    </div>
                  ) : null}
                </div>
                {selectedDistanceId === distance.id ? (
                  <span className="text-xs font-semibold text-primary">{t('create.selected')}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <Button onClick={handleCreateBatch} disabled={!canCreateBatch || !selectedDistanceId || isPending}>
          {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          {t('create.action')}
        </Button>

        {showStatusHelp ? (
          <div className="text-sm text-muted-foreground">
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
    </div>
  );
}
