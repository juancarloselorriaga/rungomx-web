'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import {
  publicFieldClassName,
  publicMutedPanelClassName,
  publicSurfaceBodyClassName,
  publicSurfaceClassName,
  publicSurfaceHeaderClassName,
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
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-start">
        <section className="space-y-4 lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-[1.9rem] border border-border/45 bg-[radial-gradient(circle_at_top_left,rgba(51,102,204,0.11),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(30,138,110,0.12),transparent_38%),color-mix(in_oklch,var(--background)_74%,var(--background-surface)_26%)] px-5 py-6 shadow-[0_32px_90px_-72px_rgba(15,23,42,0.78)] sm:px-6 sm:py-7">
            <div className="flex size-12 items-center justify-center rounded-full border border-border/45 bg-background/90 text-foreground shadow-none">
              <Users className="h-5 w-5" />
            </div>
            <div className="mt-6 space-y-3">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                RunGoMX
              </p>
              <h1 className="font-display text-[clamp(2rem,4.8vw,3.2rem)] font-medium leading-[0.9] tracking-[-0.04em] text-foreground">
                {t('create.title')}
              </h1>
              <p className="text-sm leading-7 text-muted-foreground sm:text-[0.98rem]">
                {t('create.description')}
              </p>
            </div>

            <div className={publicSummaryItemClassName}>
              <p className="font-display text-[1.45rem] font-medium tracking-[-0.03em] text-foreground">
                {eventName}
              </p>
            </div>
          </div>

          <div className={cn(publicMutedPanelClassName, 'space-y-4')}>
            <div className="space-y-1">
              <h2 className="font-medium text-foreground">{t('create.howItWorks.title')}</h2>
              <p className="text-sm leading-7 text-muted-foreground">
                {t('create.howItWorks.description')}
              </p>
            </div>
            <ul className="space-y-2 text-sm leading-7 text-muted-foreground">
              <li>{t('create.howItWorks.points.noReservation')}</li>
              <li>{t('create.howItWorks.points.selfPay')}</li>
              <li>{t('create.howItWorks.points.limit')}</li>
            </ul>
          </div>
        </section>

        <section className={publicSurfaceClassName}>
          <div className={publicSurfaceHeaderClassName}>
            <h2 className="font-display text-[clamp(1.7rem,3.1vw,2.3rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
              {t('create.form.title')}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {t('create.form.description')}
            </p>
          </div>

          <div className={cn(publicSurfaceBodyClassName, 'grid gap-5')}>
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
      </div>
    </div>
  );
}
