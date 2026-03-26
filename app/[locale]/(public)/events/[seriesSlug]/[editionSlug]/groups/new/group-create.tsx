'use client';

import { PublicStatusShell } from '@/components/common';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import {
  publicBodyTextClassName,
  publicFieldClassName,
  publicMutedPanelClassName,
  publicPanelClassName,
  publicSummaryItemClassName,
} from '@/components/common/public-form-styles';
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

export function GroupLinkCreate({
  editionId,
  seriesSlug,
  editionSlug,
  eventName,
  distances,
}: GroupLinkCreateProps) {
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
    <PublicStatusShell
      badge="RunGoMX"
      icon={<Users className="h-5 w-5" />}
      title={t('create.title')}
      description={t('create.description')}
      context={
        <div className="space-y-3">
          <div className={publicSummaryItemClassName}>
            <p className="font-display text-[1.45rem] font-medium tracking-[-0.03em] text-foreground">
              {eventName}
            </p>
          </div>
          <div className={cn(publicMutedPanelClassName, 'space-y-4')}>
            <div className="space-y-1">
              <h2 className="font-medium text-foreground">{t('create.howItWorks.title')}</h2>
              <p className={publicBodyTextClassName}>{t('create.howItWorks.description')}</p>
            </div>
            <ul className="space-y-2 text-sm leading-7 text-muted-foreground">
              <li>{t('create.howItWorks.points.noReservation')}</li>
              <li>{t('create.howItWorks.points.selfPay')}</li>
              <li>{t('create.howItWorks.points.limit')}</li>
            </ul>
          </div>
        </div>
      }
      surfaceClassName="max-w-4xl"
    >
      <section className="space-y-5">
        <div className="space-y-2 text-left">
          <h2 className="font-display text-[clamp(1.7rem,3.1vw,2.3rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
            {t('create.form.title')}
          </h2>
          <p className={publicBodyTextClassName}>{t('create.form.description')}</p>
        </div>

        <div className={cn(publicPanelClassName, 'grid gap-5')}>
          <FormField label={t('create.form.groupName.label')}>
            <input
              type="text"
              className={publicFieldClassName}
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
              className={publicFieldClassName}
              value={maxMembersRaw}
              onChange={(e) => setMaxMembersRaw(e.target.value)}
              disabled={isPending}
            />
          </FormField>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">{t('create.form.distance.label')}</p>
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
                  disabled={isPending}
                >
                  <div>
                    <div className="font-display text-[1.25rem] font-medium tracking-[-0.025em] text-foreground">
                      {distance.label}
                    </div>
                    {distance.spotsRemaining !== null ? (
                      <div className="mt-1 text-xs leading-6 text-muted-foreground">
                        {t('create.form.distance.spotsRemaining', {
                          count: distance.spotsRemaining,
                        })}
                      </div>
                    ) : null}
                  </div>
                  {selectedDistanceId === distance.id ? (
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                      {t('create.form.distance.selected')}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end border-t border-border/60 pt-5">
            <Button
              onClick={handleCreate}
              disabled={isPending || !selectedDistanceId}
              className="min-w-[12rem]"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Users className="mr-2 h-4 w-4" />
              )}
              {t('create.form.action')}
            </Button>
          </div>
        </div>
      </section>
    </PublicStatusShell>
  );
}
