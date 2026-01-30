'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { createRegistrationGroup } from '@/lib/events/registration-groups/actions';
import { cn } from '@/lib/utils';
import { Users, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/navigation';

type DistanceOption = {
  id: string;
  label: string;
  spotsRemaining: number | null;
};

type GroupLinkCreateProps = {
  editionId: string;
  seriesSlug: string;
  editionSlug: string;
  eventName: string;
  distances: DistanceOption[];
};

const textInputClassName =
  'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30';

export function GroupLinkCreate({ editionId, seriesSlug, editionSlug, eventName, distances }: GroupLinkCreateProps) {
  const t = useTranslations('pages.groupLink');
  const router = useRouter();

  const [selectedDistanceId, setSelectedDistanceId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [maxMembersRaw, setMaxMembersRaw] = useState<string>('10');
  const [isPending, startTransition] = useTransition();

  const maxMembers = useMemo(() => {
    const parsed = Number.parseInt(maxMembersRaw, 10);
    return Number.isFinite(parsed) ? parsed : 10;
  }, [maxMembersRaw]);

  const handleCreate = () => {
    if (!selectedDistanceId) {
      toast.error(t('errors.distanceRequired'));
      return;
    }

    if (!Number.isFinite(maxMembers) || maxMembers < 2) {
      toast.error(t('errors.groupSizeInvalid'));
      return;
    }

    startTransition(async () => {
      const result = await createRegistrationGroup({
        editionId,
        distanceId: selectedDistanceId,
        name: groupName.trim() || null,
        maxMembers,
      });

      if (!result.ok) {
        toast.error(t('errors.createGroup'), { description: result.error });
        return;
      }

      router.push({
        pathname: '/events/[seriesSlug]/[editionSlug]/groups/[groupToken]',
        params: { seriesSlug, editionSlug, groupToken: result.data.groupToken },
      });
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('create.title')}</h1>
        <p className="text-muted-foreground">{t('create.description')}</p>
        <p className="text-sm text-muted-foreground">{eventName}</p>
      </div>

      <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
            <Users className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{t('create.howItWorks.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('create.howItWorks.description')}</p>
          </div>
        </div>
        <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
          <li>{t('create.howItWorks.points.noReservation')}</li>
          <li>{t('create.howItWorks.points.selfPay')}</li>
          <li>{t('create.howItWorks.points.limit')}</li>
        </ul>
      </div>

      <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t('create.form.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('create.form.description')}</p>
        </div>

        <div className="grid gap-4">
          <FormField label={t('create.form.groupName.label')}>
            <input
              type="text"
              className={textInputClassName}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t('create.form.groupName.placeholder')}
              maxLength={255}
              disabled={isPending}
            />
          </FormField>

          <FormField label={t('create.form.groupSize.label')} required>
            <input
              type="number"
              min={2}
              max={50}
              inputMode="numeric"
              className={textInputClassName}
              value={maxMembersRaw}
              onChange={(e) => setMaxMembersRaw(e.target.value)}
              disabled={isPending}
            />
          </FormField>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t('create.form.distance.label')}</p>
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
                  disabled={isPending}
                >
                  <div>
                    <div className="font-medium">{distance.label}</div>
                    {distance.spotsRemaining !== null ? (
                      <div className="text-xs text-muted-foreground">
                        {t('create.form.distance.spotsRemaining', { count: distance.spotsRemaining })}
                      </div>
                    ) : null}
                  </div>
                  {selectedDistanceId === distance.id ? (
                    <span className="text-xs font-semibold text-primary">{t('create.form.distance.selected')}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={handleCreate} disabled={isPending || !selectedDistanceId}>
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Users className="h-4 w-4 mr-2" />}
            {t('create.form.action')}
          </Button>
        </div>
      </div>
    </div>
  );
}
