'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ProLockedCard } from '@/components/billing/pro-locked-card';
import { Link, useRouter } from '@/i18n/navigation';
import { cloneEdition, checkSlugAvailability } from '@/lib/events/actions';
import { renameEventSeriesSlug } from '@/lib/events/series/actions';
import { cn } from '@/lib/utils';
import { getProFeatureMeta } from '@/lib/pro-features/catalog';
import { Calendar, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

type EditionsManagerEdition = {
  id: string;
  slug: string;
  editionLabel: string;
  visibility: string;
  startsAt: string | null;
  createdAt: string;
  previousEditionId: string | null;
  clonedFromEditionId: string | null;
  registrationCount: number;
};

type EditionsManagerProps = {
  currentEditionId: string;
  seriesId: string;
  seriesName: string;
  seriesSlug: string;
  organizationId: string;
  editions: EditionsManagerEdition[];
};

type VisibilityType = 'draft' | 'published' | 'unlisted' | 'archived';
type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

const visibilityStyles: Record<VisibilityType, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  unlisted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  archived: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseYear(label: string): number | null {
  const trimmed = label.trim();
  if (!/^\d{4}$/.test(trimmed)) return null;
  const year = Number.parseInt(trimmed, 10);
  return Number.isFinite(year) ? year : null;
}

function buildSuggestedSlug(sourceSlug: string, sourceLabel: string, targetLabel: string): string {
  const fromYear = parseYear(sourceLabel);
  const toYear = parseYear(targetLabel);
  const normalizedSource = slugify(sourceSlug);

  if (fromYear !== null && toYear !== null) {
    const replaced = normalizedSource.replaceAll(String(fromYear), String(toYear));
    if (replaced !== normalizedSource) return replaced;
  }

  if (normalizedSource.endsWith(`-${slugify(sourceLabel)}`)) {
    return `${normalizedSource.slice(0, -(`-${slugify(sourceLabel)}`.length))}-${slugify(targetLabel)}`;
  }

  return slugify(`${normalizedSource}-${targetLabel}`);
}

function formatDate(dateIso: string | null, locale: string): string {
  if (!dateIso) return '-';
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

export function EditionsManager({
  currentEditionId,
  seriesId,
  seriesName,
  seriesSlug,
  organizationId,
  editions,
}: EditionsManagerProps) {
  const t = useTranslations('pages.dashboardEvents.editions');
  const tSlug = useTranslations('pages.dashboardEvents');
  const tVisibility = useTranslations('pages.dashboardEvents.visibility');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const cloneMeta = getProFeatureMeta('event_clone');

  const editionsById = useMemo(() => new Map(editions.map((e) => [e.id, e])), [editions]);

  const [seriesSlugValue, setSeriesSlugValue] = useState(seriesSlug);
  const [isRenamingSeries, setIsRenamingSeries] = useState(false);
  const [seriesSlugStatus, setSeriesSlugStatus] = useState<SlugStatus>('idle');
  const seriesSlugTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seriesSlugRequestIdRef = useRef(0);
  const [showSeriesSlugConfirm, setShowSeriesSlugConfirm] = useState(false);
  const [pendingSeriesSlug, setPendingSeriesSlug] = useState<string | null>(null);

  const [openForEditionId, setOpenForEditionId] = useState<string | null>(null);
  const [newEditionLabel, setNewEditionLabel] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showProLockedDialog, setShowProLockedDialog] = useState(false);

  const openEdition = openForEditionId ? editionsById.get(openForEditionId) : undefined;

  function openDialog(edition: EditionsManagerEdition) {
    const sourceYear = parseYear(edition.editionLabel);
    const suggestedLabel = sourceYear ? String(sourceYear + 1) : '';
    const label = suggestedLabel || '';
    setNewEditionLabel(label);
    setNewSlug(label ? buildSuggestedSlug(edition.slug, edition.editionLabel, label) : slugify(`${edition.slug}-new`));
    setFormError(null);
    setOpenForEditionId(edition.id);
  }

  function handleSeriesSlugChange(nextValue: string) {
    const trimmed = nextValue.trim();
    if (!organizationId || trimmed.length < 2 || trimmed === seriesSlug) {
      setSeriesSlugStatus('idle');
      return;
    }

    if (seriesSlugTimeoutRef.current) {
      clearTimeout(seriesSlugTimeoutRef.current);
    }

    setSeriesSlugStatus('checking');
    const requestId = ++seriesSlugRequestIdRef.current;

    seriesSlugTimeoutRef.current = setTimeout(async () => {
      const result = await checkSlugAvailability({
        organizationId,
        slug: trimmed,
      });

      if (seriesSlugRequestIdRef.current !== requestId) return;

      if (!result.ok) {
        setSeriesSlugStatus('error');
        return;
      }

      setSeriesSlugStatus(result.data.available ? 'available' : 'taken');
    }, 400);
  }

  async function handleRenameSeriesSlug(nextSlugOverride?: string) {
    const nextSlug = nextSlugOverride ?? slugify(seriesSlugValue);
    if (!nextSlug || nextSlug.length < 2) {
      toast.error(t('seriesSlug.error'), { description: t('seriesSlug.errors.missing') });
      return;
    }

    setIsRenamingSeries(true);
    try {
      const result = await renameEventSeriesSlug({ seriesId, slug: nextSlug });
      if (!result.ok) {
        const errorKey = result.code === 'SLUG_TAKEN' ? 'slugTaken' : 'generic';
        toast.error(t('seriesSlug.error'), { description: t(`seriesSlug.errors.${errorKey}`) });
        return;
      }

      toast.success(t('seriesSlug.success'));
      router.refresh();
    } catch {
      toast.error(t('seriesSlug.error'));
    } finally {
      setIsRenamingSeries(false);
    }
  }

  function requestSeriesSlugRename() {
    const nextSlug = slugify(seriesSlugValue);
    if (!nextSlug || nextSlug.length < 2) {
      toast.error(t('seriesSlug.error'), { description: t('seriesSlug.errors.missing') });
      return;
    }

    if (nextSlug === seriesSlug) {
      handleRenameSeriesSlug(nextSlug);
      return;
    }

    setPendingSeriesSlug(nextSlug);
    setShowSeriesSlugConfirm(true);
  }

  async function confirmSeriesSlugRename() {
    const nextSlug = pendingSeriesSlug ?? slugify(seriesSlugValue);
    setShowSeriesSlugConfirm(false);
    setPendingSeriesSlug(null);
    await handleRenameSeriesSlug(nextSlug);
  }

  const isSeriesSlugTaken =
    seriesSlugValue.trim().length >= 2 &&
    seriesSlugValue.trim() !== seriesSlug &&
    seriesSlugStatus === 'taken';
  const slugStatusClass = (status: SlugStatus) =>
    status === 'available'
      ? 'text-emerald-600'
      : status === 'taken'
        ? 'text-destructive'
        : 'text-muted-foreground';

  const slugStatusLabel = (status: SlugStatus) => {
    switch (status) {
      case 'checking':
        return tSlug('slugStatus.checking');
      case 'available':
        return tSlug('slugStatus.available');
      case 'taken':
        return tSlug('slugStatus.taken');
      case 'error':
        return tSlug('slugStatus.error');
      default:
        return null;
    }
  };
  const showSeriesSlugStatus =
    seriesSlugValue.trim().length >= 2 &&
    seriesSlugValue.trim() !== seriesSlug &&
    seriesSlugStatus !== 'idle';
  const seriesSlugStatusLabel = slugStatusLabel(seriesSlugStatus);

  async function handleClone() {
    if (!openEdition) return;
    setFormError(null);

    const editionLabel = newEditionLabel.trim();
    const slug = slugify(newSlug);

    if (!editionLabel) {
      setFormError(t('clone.errors.missingLabel'));
      return;
    }
    if (!slug || slug.length < 2) {
      setFormError(t('clone.errors.missingSlug'));
      return;
    }

    setIsCloning(true);
    try {
      const result = await cloneEdition({
        sourceEditionId: openEdition.id,
        editionLabel,
        slug,
      });

      if (!result.ok) {
        if (result.code === 'PRO_REQUIRED') {
          setOpenForEditionId(null);
          setShowProLockedDialog(true);
          return;
        }
        const errorKey =
          result.code === 'SLUG_TAKEN'
            ? 'slugTaken'
            : result.code === 'LABEL_TAKEN'
              ? 'labelTaken'
              : 'generic';
        toast.error(t('clone.error'), { description: t(`clone.errors.${errorKey}`) });
        return;
      }

      toast.success(t('clone.success'));
      setOpenForEditionId(null);
      router.push({ pathname: '/dashboard/events/[eventId]', params: { eventId: result.data.editionId } });
      router.refresh();
    } catch {
      toast.error(t('clone.error'));
    } finally {
      setIsCloning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card/50">
        <div className="border-b border-border px-6 py-3">
          <h2 className="text-base font-semibold">{t('seriesSlug.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('seriesSlug.description')}</p>
        </div>
        <div className="px-6 py-4 grid gap-1 sm:grid-cols-[1fr_auto] sm:items-end sm:gap-4">
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t('seriesSlug.fields.slug')}</span>
            <input
              value={seriesSlugValue}
              onChange={(e) => {
                setSeriesSlugValue(e.target.value);
                handleSeriesSlugChange(e.target.value);
              }}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              placeholder={t('seriesSlug.fields.slugPlaceholder')}
              disabled={isRenamingSeries}
            />
          </label>
          <Button
            type="button"
            onClick={requestSeriesSlugRename}
            disabled={isRenamingSeries || isSeriesSlugTaken}
          >
            {isRenamingSeries ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('seriesSlug.saving')}
              </>
            ) : (
              t('seriesSlug.save')
            )}
          </Button>
          <p
            className={cn(
              'text-xs min-h-[1rem] sm:col-start-1 -mt-1',
              showSeriesSlugStatus
                ? slugStatusClass(seriesSlugStatus)
                : 'text-transparent',
            )}
            aria-hidden={!showSeriesSlugStatus}
          >
            {showSeriesSlugStatus ? seriesSlugStatusLabel : '\u00A0'}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/50">
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{t('listTitle', { seriesName })}</h2>
            <p className="text-sm text-muted-foreground">{t('listDescription')}</p>
          </div>
        </div>
      </div>

      <div className="divide-y">
        {editions.length === 0 ? (
          <div className="px-6 py-8 text-center text-muted-foreground">{t('empty')}</div>
        ) : (
          editions.map((edition) => (
            <div key={edition.id} className="px-6 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 truncate font-medium">
                    {seriesName} {edition.editionLabel}
                  </h3>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      visibilityStyles[edition.visibility as VisibilityType] || visibilityStyles.draft,
                    )}
                  >
                    {tVisibility(edition.visibility as VisibilityType)}
                  </span>
                  {edition.id === currentEditionId ? (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {t('current')}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(edition.startsAt, locale)}</span>
                  </div>
                  <div>
                    {t('registrations', { count: edition.registrationCount })}
                  </div>
                  <div className="font-mono text-xs">{edition.slug}</div>
                </div>

                {edition.previousEditionId || edition.clonedFromEditionId ? (
                  <div className="text-xs text-muted-foreground">
                    {edition.previousEditionId && editionsById.get(edition.previousEditionId)
                      ? t('previousEdition', { editionLabel: editionsById.get(edition.previousEditionId)!.editionLabel })
                      : null}
                    {edition.previousEditionId && edition.clonedFromEditionId ? ' • ' : null}
                    {edition.clonedFromEditionId && editionsById.get(edition.clonedFromEditionId)
                      ? t('clonedFrom', { editionLabel: editionsById.get(edition.clonedFromEditionId)!.editionLabel })
                      : null}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button asChild variant="outline">
                  <Link href={{ pathname: '/dashboard/events/[eventId]', params: { eventId: edition.id } }}>
                    <ExternalLink className="h-4 w-4" />
                    {t('view')}
                  </Link>
                </Button>

                <Dialog open={openForEditionId === edition.id} onOpenChange={(open) => (open ? openDialog(edition) : setOpenForEditionId(null))}>
                  <DialogTrigger asChild>
                    <Button type="button" onClick={() => openDialog(edition)}>
                      <Copy className="h-4 w-4" />
                      {t('clone.button')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg" onOpenAutoFocus={(event) => event.preventDefault()}>
                    <DialogHeader>
                      <DialogTitle>{t('clone.title', { editionLabel: edition.editionLabel })}</DialogTitle>
                      <DialogDescription>{t('clone.description')}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                      <label className="block space-y-2 text-sm">
                        <span className="font-medium">{t('clone.fields.editionLabel')}</span>
                        <input
                          value={newEditionLabel}
                          onChange={(e) => {
                            const value = e.target.value;
                            setNewEditionLabel(value);
                            setNewSlug(buildSuggestedSlug(edition.slug, edition.editionLabel, value));
                          }}
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          placeholder={t('clone.fields.editionLabelPlaceholder')}
                          disabled={isCloning}
                        />
                      </label>

                      <label className="block space-y-2 text-sm">
                        <span className="font-medium">{t('clone.fields.slug')}</span>
                        <input
                          value={newSlug}
                          onChange={(e) => setNewSlug(e.target.value)}
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                          placeholder={t('clone.fields.slugPlaceholder')}
                          disabled={isCloning}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('clone.fields.slugHint')}
                        </p>
                      </label>

                      {formError ? (
                        <p className="text-sm text-destructive">{formError}</p>
                      ) : null}
                    </div>

                    <DialogFooter className="flex justify-end gap-2 sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpenForEditionId(null)}
                        disabled={isCloning}
                      >
                        {t('clone.cancel')}
                      </Button>
                      <Button type="button" onClick={handleClone} disabled={isCloning}>
                        {isCloning ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('clone.cloning')}
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            {t('clone.confirm')}
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ))
        )}
      </div>
    </div>

    <Dialog open={showSeriesSlugConfirm} onOpenChange={setShowSeriesSlugConfirm}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('seriesSlug.confirm.title')}</DialogTitle>
          <DialogDescription>{t('seriesSlug.confirm.description')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex justify-end gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowSeriesSlugConfirm(false)}
            disabled={isRenamingSeries}
          >
            {t('seriesSlug.confirm.cancel')}
          </Button>
          <Button type="button" onClick={confirmSeriesSlugRename} disabled={isRenamingSeries}>
            {t('seriesSlug.confirm.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={showProLockedDialog} onOpenChange={setShowProLockedDialog}>
      <DialogContent className="sm:max-w-lg">
        <div className="space-y-4">
          <ProLockedCard
            title={tCommon(cloneMeta.i18n.lockedTitleKey)}
            description={tCommon(cloneMeta.i18n.lockedDescriptionKey)}
            ctaLabel={tCommon(cloneMeta.i18n.lockedCtaKey)}
            href={cloneMeta.upsellHref}
          />
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setShowProLockedDialog(false)}>
              {tCommon('close')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
  );
}
