'use client';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { MarkdownField } from '@/components/ui/markdown-field';
import { Switch } from '@/components/ui/switch';
import { useRouter } from '@/i18n/navigation';
import {
  updateEventEdition,
  updateEventVisibility,
  setRegistrationPaused,
  createDistance,
  updateDistance,
  deleteDistance,
  updateDistancePrice,
  checkSlugAvailability,
  confirmEventMediaUpload,
  updateEventCapacitySettings,
} from '@/lib/events/actions';
import { TERRAIN_TYPES, EVENT_VISIBILITY, type TerrainType } from '@/lib/events/constants';
import {
  EVENT_MEDIA_BLOB_PREFIX,
  EVENT_MEDIA_IMAGE_TYPES,
  EVENT_MEDIA_MAX_FILE_SIZE,
} from '@/lib/events/media/constants';
import { validateEventImageFile } from '@/lib/events/media/utils';
import type { EventEditionDetail, EventDistanceDetail } from '@/lib/events/queries';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import {
  Calendar,
  Check,
  Eye,
  ImagePlus,
  Loader2,
  MapPin,
  Pause,
  Play,
  Plus,
  Save,
  Settings2,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { upload } from '@vercel/blob/client';
import { toast } from 'sonner';
import Image from 'next/image';

const LocationField = dynamic(
  () => import('@/components/location/location-field').then((mod) => mod.LocationField),
  { ssr: false, loading: () => <div className="h-10 rounded-md border bg-muted animate-pulse" /> },
);

type EventSettingsFormProps = {
  event: EventEditionDetail;
  wizardMode?: boolean;
};

type VisibilityType = 'draft' | 'published' | 'unlisted' | 'archived';
type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

const TIMEZONE_OPTIONS = [
  { value: 'America/Mexico_City', label: 'America/Mexico_City' },
  { value: 'America/Cancun', label: 'America/Cancun' },
  { value: 'America/Tijuana', label: 'America/Tijuana' },
  { value: 'America/Chihuahua', label: 'America/Chihuahua' },
  { value: 'America/Hermosillo', label: 'America/Hermosillo' },
  { value: 'America/Mazatlan', label: 'America/Mazatlan' },
] as const;

const visibilityStyles: Record<VisibilityType, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  unlisted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  archived: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export function EventSettingsForm({ event, wizardMode = false }: EventSettingsFormProps) {
  const t = useTranslations('pages.dashboardEventSettings');
  const tSlug = useTranslations('pages.dashboardEvents');
  const tVis = useTranslations('pages.dashboardEvents.visibility');
  const tDescription = useTranslations('pages.dashboardEventSettings.descriptionField');
  const tCapacity = useTranslations('pages.dashboardEventSettings.capacity');
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editionSlugStatus, setEditionSlugStatus] = useState<SlugStatus>('idle');
  const editionSlugTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editionSlugRequestIdRef = useRef(0);
  const [showSlugConfirm, setShowSlugConfirm] = useState(false);
  const heroImageInputRef = useRef<HTMLInputElement>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(event.heroImageUrl ?? null);
  const [heroPreviewUrl, setHeroPreviewUrl] = useState<string | null>(null);
  const [isUploadingHeroImage, setIsUploadingHeroImage] = useState(false);
  const [isSavingHeroImage, setIsSavingHeroImage] = useState(false);
  const [capacityScope, setCapacityScope] = useState<'per_distance' | 'shared_pool'>(
    event.sharedCapacity ? 'shared_pool' : 'per_distance',
  );
  const [sharedCapacityValue, setSharedCapacityValue] = useState(
    event.sharedCapacity ? String(event.sharedCapacity) : '',
  );
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [isUpdatingCapacity, setIsUpdatingCapacity] = useState(false);
  const maxHeroImageSizeMb = Math.floor(EVENT_MEDIA_MAX_FILE_SIZE / (1024 * 1024));
  const tHero = useTranslations('pages.dashboardEventSettings.heroImage');

  // Event details form
  const detailsForm = useForm<{
    editionLabel: string;
    slug: string;
    description: string;
    timezone: string;
    startsAt: string;
    endsAt: string;
    city: string;
    state: string;
    locationDisplay: string;
    address: string;
    latitude: string;
    longitude: string;
    externalUrl: string;
    registrationOpensAt: string;
    registrationClosesAt: string;
  }>({
    defaultValues: {
      editionLabel: event.editionLabel,
      slug: event.slug,
      description: event.description || '',
      timezone: event.timezone,
      startsAt: event.startsAt ? formatDateForInput(event.startsAt) : '',
      endsAt: event.endsAt ? formatDateForInput(event.endsAt) : '',
      city: event.city || '',
      state: event.state || '',
      locationDisplay: event.locationDisplay || '',
      address: event.address || '',
      latitude: event.latitude || '',
      longitude: event.longitude || '',
      externalUrl: event.externalUrl || '',
      registrationOpensAt: event.registrationOpensAt ? formatDateTimeForInput(event.registrationOpensAt) : '',
      registrationClosesAt: event.registrationClosesAt ? formatDateTimeForInput(event.registrationClosesAt) : '',
    },
    onSubmit: async (values) => {
      if (editionSlugStatus === 'taken') {
        return { ok: false, error: 'VALIDATION_ERROR', message: tSlug('slugStatus.taken') };
      }

      const result = await updateEventEdition({
        editionId: event.id,
        editionLabel: values.editionLabel || undefined,
        slug: values.slug || undefined,
        description: values.description.trim() || null,
        timezone: values.timezone || undefined,
        startsAt: values.startsAt ? new Date(values.startsAt).toISOString() : null,
        endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null,
        city: values.city || null,
        state: values.state || null,
        locationDisplay: values.locationDisplay || null,
        address: values.address || null,
        latitude: values.latitude || null,
        longitude: values.longitude || null,
        externalUrl: values.externalUrl || null,
        registrationOpensAt: values.registrationOpensAt ? new Date(values.registrationOpensAt).toISOString() : null,
        registrationClosesAt: values.registrationClosesAt ? new Date(values.registrationClosesAt).toISOString() : null,
      });

      if (!result.ok) {
        return { ok: false, error: 'SERVER_ERROR', message: result.error };
      }

      return { ok: true, data: undefined };
    },
    onSuccess: () => {
      router.refresh();
    },
  });

  const isEditionSlugChanged = detailsForm.values.slug.trim() !== event.slug;

  const handleDetailsSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (isEditionSlugChanged) {
      setShowSlugConfirm(true);
      return;
    }

    detailsForm.handleSubmit(event);
  };

  const confirmSlugChange = () => {
    setShowSlugConfirm(false);
    detailsForm.handleSubmit({ preventDefault() {} } as React.FormEvent<HTMLFormElement>);
  };

  // Visibility state
  const [visibility, setVisibility] = useState<VisibilityType>(event.visibility as VisibilityType);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);

  async function handleVisibilityChange(newVisibility: VisibilityType) {
    setIsUpdatingVisibility(true);
    try {
      const result = await updateEventVisibility({
        editionId: event.id,
        visibility: newVisibility,
      });
      if (result.ok) {
        setVisibility(newVisibility);
        startTransition(() => {
          router.refresh();
        });
      } else {
        const errorKey =
          result.code === 'MISSING_DISTANCE'
            ? 'errors.missingDistances'
            : result.code === 'MISSING_PRICING'
              ? 'errors.missingPrices'
              : 'errors.generic';
        toast.error(t(`visibility.${errorKey}`));
      }
    } finally {
      setIsUpdatingVisibility(false);
    }
  }

  // Registration pause state
  const [isRegistrationPaused, setIsRegistrationPaused] = useState(event.isRegistrationPaused);
  const [isUpdatingPause, setIsUpdatingPause] = useState(false);

  async function handlePauseToggle() {
    setIsUpdatingPause(true);
    try {
      const result = await setRegistrationPaused({
        editionId: event.id,
        paused: !isRegistrationPaused,
      });
      if (result.ok) {
        setIsRegistrationPaused(!isRegistrationPaused);
        startTransition(() => {
          router.refresh();
        });
      }
    } finally {
      setIsUpdatingPause(false);
    }
  }

  // Distance management state
  const [distances, setDistances] = useState<EventDistanceDetail[]>(event.distances);
  const [showAddDistance, setShowAddDistance] = useState(wizardMode && event.distances.length === 0);
  const [editingDistanceId, setEditingDistanceId] = useState<string | null>(null);

  function handleEditionSlugChange(nextSlug: string) {
    const trimmed = nextSlug.trim();
    if (trimmed.length < 2 || trimmed === event.slug) {
      setEditionSlugStatus('idle');
      return;
    }

    if (editionSlugTimeoutRef.current) {
      clearTimeout(editionSlugTimeoutRef.current);
    }

    setEditionSlugStatus('checking');
    const requestId = ++editionSlugRequestIdRef.current;

    editionSlugTimeoutRef.current = setTimeout(async () => {
      const result = await checkSlugAvailability({
        seriesId: event.seriesId,
        slug: trimmed,
      });

      if (editionSlugRequestIdRef.current !== requestId) return;

      if (!result.ok) {
        setEditionSlugStatus('error');
        return;
      }

      setEditionSlugStatus(result.data.available ? 'available' : 'taken');
    }, 400);
  }

  const isEditionSlugTaken =
    detailsForm.values.slug.trim().length >= 2 &&
    detailsForm.values.slug.trim() !== event.slug &&
    editionSlugStatus === 'taken';
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
  const slugField = detailsForm.register('slug');
  const heroImagePreview = heroPreviewUrl ?? heroImageUrl;
  const isHeroImageBusy = isUploadingHeroImage || isSavingHeroImage;
  const sharedCapacityEnabled = capacityScope === 'shared_pool';

  useEffect(() => {
    return () => {
      if (heroPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(heroPreviewUrl);
      }
    };
  }, [heroPreviewUrl]);

  async function handleHeroImageSelect(changeEvent: React.ChangeEvent<HTMLInputElement>) {
    const file = changeEvent.target.files?.[0];
    if (!file) return;

    const validation = validateEventImageFile(file);
    if (!validation.valid) {
      const errorKey =
        validation.reason === 'file_too_large' ? 'errors.fileTooLarge' : 'errors.invalidType';
      toast.error(tHero(errorKey, { maxSize: maxHeroImageSizeMb }));
      if (heroImageInputRef.current) {
        heroImageInputRef.current.value = '';
      }
      return;
    }

    setIsUploadingHeroImage(true);
    const previewUrl = URL.createObjectURL(file);
    setHeroPreviewUrl(previewUrl);

    try {
      const safeName = file.name.replace(/\s+/g, '-');
      const uploadPath = `${EVENT_MEDIA_BLOB_PREFIX}/${event.organizationId}/${event.id}/${crypto.randomUUID()}-${safeName}`;
      const blob = await upload(uploadPath, file, {
        access: 'public',
        handleUploadUrl: '/api/events/media',
        clientPayload: JSON.stringify({
          organizationId: event.organizationId,
          purpose: 'event-hero-image',
        }),
      });

      const confirmResult = await confirmEventMediaUpload({
        organizationId: event.organizationId,
        blobUrl: blob.url,
        kind: 'image',
      });

      if (!confirmResult.ok) {
        throw new Error(confirmResult.error);
      }

      const updateResult = await updateEventEdition({
        editionId: event.id,
        heroImageMediaId: confirmResult.data.mediaId,
      });

      if (!updateResult.ok) {
        throw new Error(updateResult.error);
      }

      setHeroImageUrl(blob.url);
      setHeroPreviewUrl(null);
      toast.success(tHero('success.uploaded'));
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      console.error('[events] Hero image upload failed:', error);
      toast.error(tHero('errors.uploadFailed'));
      setHeroPreviewUrl(null);
    } finally {
      setIsUploadingHeroImage(false);
      if (heroImageInputRef.current) {
        heroImageInputRef.current.value = '';
      }
    }
  }

  async function handleHeroImageRemove() {
    if (!heroImageUrl || isHeroImageBusy) return;

    setIsSavingHeroImage(true);
    try {
      const result = await updateEventEdition({
        editionId: event.id,
        heroImageMediaId: null,
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      setHeroImageUrl(null);
      setHeroPreviewUrl(null);
      toast.success(tHero('success.removed'));
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      console.error('[events] Hero image remove failed:', error);
      toast.error(tHero('errors.saveFailed'));
    } finally {
      setIsSavingHeroImage(false);
    }
  }

  function handleHeroImageUploadClick() {
    heroImageInputRef.current?.click();
  }

  async function handleCapacitySave() {
    setIsUpdatingCapacity(true);
    setCapacityError(null);

    let sharedCapacity: number | null = null;
    if (sharedCapacityEnabled) {
      const parsedCapacity = Number(sharedCapacityValue);
      if (!sharedCapacityValue || Number.isNaN(parsedCapacity) || parsedCapacity <= 0) {
        setCapacityError(tCapacity('errors.required'));
        setIsUpdatingCapacity(false);
        return;
      }
      sharedCapacity = parsedCapacity;
    }

    const result = await updateEventCapacitySettings({
      editionId: event.id,
      capacityScope: sharedCapacityEnabled ? 'shared_pool' : 'per_distance',
      sharedCapacity: sharedCapacityEnabled ? sharedCapacity : null,
    });

    setIsUpdatingCapacity(false);

    if (!result.ok) {
      setCapacityError(tCapacity('errors.saveFailed'));
      return;
    }

    setCapacityScope(result.data.capacityScope);
    setSharedCapacityValue(result.data.sharedCapacity ? String(result.data.sharedCapacity) : '');
    setDistances((prev) =>
      prev.map((distance) => ({ ...distance, capacityScope: result.data.capacityScope })),
    );
    toast.success(tCapacity('success'));
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {wizardMode && (
        <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="font-semibold text-sm">{t('wizard.title')}</p>
          <p className="text-sm text-muted-foreground">{t('wizard.description')}</p>
          <div className="mt-3 flex flex-col gap-1 text-sm">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              <span>{t('wizard.steps.distance')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              <span>{t('wizard.steps.publish')}</span>
            </div>
          </div>
        </section>
      )}
      {/* Visibility Section */}
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{t('visibility.title')}</h2>
          </div>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              visibilityStyles[visibility],
            )}
          >
            {tVis(visibility)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{t('visibility.description')}</p>

        <div className="flex flex-wrap gap-2">
          {EVENT_VISIBILITY.map((vis) => (
            <Button
              key={vis}
              variant={visibility === vis ? 'default' : 'outline'}
              size="sm"
              disabled={isUpdatingVisibility}
              onClick={() => handleVisibilityChange(vis as VisibilityType)}
            >
              {isUpdatingVisibility && visibility !== vis ? null : visibility === vis ? (
                <Check className="h-4 w-4 mr-1" />
              ) : null}
              {tVis(vis as VisibilityType)}
            </Button>
          ))}
        </div>
      </section>

      {/* Registration Control Section */}
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{t('registration.title')}</h2>
          </div>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              isRegistrationPaused
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
            )}
          >
            {isRegistrationPaused ? t('registration.paused') : t('registration.active')}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{t('registration.description')}</p>

        <Button
          variant={isRegistrationPaused ? 'default' : 'outline'}
          disabled={isUpdatingPause}
          onClick={handlePauseToggle}
        >
          {isUpdatingPause ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : isRegistrationPaused ? (
            <Play className="h-4 w-4 mr-2" />
          ) : (
            <Pause className="h-4 w-4 mr-2" />
          )}
          {isRegistrationPaused ? t('registration.resume') : t('registration.pause')}
        </Button>
      </section>

      {/* Hero Image Section */}
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ImagePlus className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{tHero('title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{tHero('description')}</p>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="relative aspect-[16/9] w-full max-w-xl overflow-hidden rounded-lg border bg-muted">
            {heroImagePreview ? (
              <Image
                src={heroImagePreview}
                alt={`${event.seriesName} ${event.editionLabel}`}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 768px"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                <span className="text-sm font-medium text-muted-foreground">
                  {tHero('empty')}
                </span>
              </div>
            )}
            {isUploadingHeroImage && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {tHero('helper', { maxSize: maxHeroImageSizeMb })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleHeroImageUploadClick}
                disabled={isHeroImageBusy}
              >
                <ImagePlus className="h-4 w-4 mr-2" />
                {heroImagePreview ? tHero('actions.change') : tHero('actions.upload')}
              </Button>

              {heroImagePreview && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleHeroImageRemove}
                  disabled={isHeroImageBusy}
                  className="text-destructive hover:bg-destructive/10"
                >
                  {isSavingHeroImage ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {tHero('actions.removing')}
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      {tHero('actions.remove')}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        <input
          ref={heroImageInputRef}
          type="file"
          accept={EVENT_MEDIA_IMAGE_TYPES.join(',')}
          onChange={handleHeroImageSelect}
          className="hidden"
        />
      </section>

      {/* Event Details Section */}
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t('details.title')}</h2>
        </div>

        <Form form={detailsForm} className="space-y-6" onSubmitCapture={handleDetailsSubmit}>
          <FormError />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label={t('details.editionLabel')}
              error={detailsForm.errors.editionLabel}
            >
              <input
                type="text"
                {...detailsForm.register('editionLabel')}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                disabled={detailsForm.isSubmitting}
              />
            </FormField>

            <FormField label={t('details.slug')} error={detailsForm.errors.slug}>
              <div className="space-y-1">
                <input
                  type="text"
                  name={slugField.name}
                  value={slugField.value}
                  onChange={(event) => {
                    slugField.onChange(event);
                    handleEditionSlugChange(event.target.value);
                  }}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 font-mono"
                  disabled={detailsForm.isSubmitting}
                />
                {detailsForm.values.slug.trim().length >= 2 &&
                  detailsForm.values.slug.trim() !== event.slug &&
                  editionSlugStatus !== 'idle' && (
                  <p className={cn('text-xs', slugStatusClass(editionSlugStatus))}>
                    {slugStatusLabel(editionSlugStatus)}
                  </p>
                )}
              </div>
            </FormField>
          </div>

          <MarkdownField
            label={tDescription('label')}
            value={detailsForm.values.description}
            onChange={(value) => detailsForm.setFieldValue('description', value)}
            error={detailsForm.errors.description}
            disabled={detailsForm.isSubmitting}
            helperText={tDescription('help')}
            textareaClassName="resize-none"
            textareaProps={{ rows: 4 }}
          />

          <FormField label={t('details.timezone')} error={detailsForm.errors.timezone}>
            <select
              {...detailsForm.register('timezone')}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={detailsForm.isSubmitting}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('details.startsAt')} error={detailsForm.errors.startsAt}>
              <DatePicker
                locale={locale}
                value={detailsForm.values.startsAt || ''}
                onChangeAction={(value) => detailsForm.setFieldValue('startsAt', value)}
                clearLabel={t('details.clearDate')}
              />
            </FormField>

            <FormField label={t('details.endsAt')} error={detailsForm.errors.endsAt}>
              <DatePicker
                locale={locale}
                value={detailsForm.values.endsAt || ''}
                onChangeAction={(value) => detailsForm.setFieldValue('endsAt', value)}
                clearLabel={t('details.clearDate')}
              />
            </FormField>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium">{t('details.locationSection')}</h3>
            </div>

            <LocationField
              label={t('details.locationLabel')}
              location={
                detailsForm.values.latitude && detailsForm.values.longitude
                  ? {
                      lat: Number(detailsForm.values.latitude),
                      lng: Number(detailsForm.values.longitude),
                      formattedAddress: detailsForm.values.locationDisplay || '',
                    }
                  : null
              }
              country="MX"
              language={locale}
              onLocationChangeAction={(location) => {
                if (location) {
                  detailsForm.setFieldValue('latitude', String(location.lat));
                  detailsForm.setFieldValue('longitude', String(location.lng));
                  detailsForm.setFieldValue('locationDisplay', location.formattedAddress || '');
                  if (location.city) detailsForm.setFieldValue('city', location.city);
                  if (location.region) detailsForm.setFieldValue('state', location.region);
                } else {
                  detailsForm.setFieldValue('latitude', '');
                  detailsForm.setFieldValue('longitude', '');
                  detailsForm.setFieldValue('locationDisplay', '');
                  detailsForm.setFieldValue('city', '');
                  detailsForm.setFieldValue('state', '');
                }
              }}
            />
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-4">{t('details.registrationWindow')}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label={t('details.registrationOpensAt')}
                error={detailsForm.errors.registrationOpensAt}
              >
                <DatePicker
                  locale={locale}
                  value={detailsForm.values.registrationOpensAt ? detailsForm.values.registrationOpensAt.split('T')[0] : ''}
                  onChangeAction={(value) => {
                    // Preserve time if it exists, otherwise set to start of day
                    const currentValue = detailsForm.values.registrationOpensAt;
                    const timepart = currentValue ? currentValue.split('T')[1] : '00:00';
                    detailsForm.setFieldValue('registrationOpensAt', value ? `${value}T${timepart}` : '');
                  }}
                  clearLabel={t('details.clearDate')}
                />
              </FormField>

              <FormField
                label={t('details.registrationClosesAt')}
                error={detailsForm.errors.registrationClosesAt}
              >
                <DatePicker
                  locale={locale}
                  value={detailsForm.values.registrationClosesAt ? detailsForm.values.registrationClosesAt.split('T')[0] : ''}
                  onChangeAction={(value) => {
                    // Preserve time if it exists, otherwise set to end of day
                    const currentValue = detailsForm.values.registrationClosesAt;
                    const timepart = currentValue ? currentValue.split('T')[1] : '23:59';
                    detailsForm.setFieldValue('registrationClosesAt', value ? `${value}T${timepart}` : '');
                  }}
                  clearLabel={t('details.clearDate')}
                />
              </FormField>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={detailsForm.isSubmitting || isEditionSlugTaken}>
              {detailsForm.isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t('details.save')}
            </Button>
          </div>
        </Form>
      </section>

      {/* Capacity Section */}
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{tCapacity('title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{tCapacity('description')}</p>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{tCapacity('toggleLabel')}</p>
              <p className="text-xs text-muted-foreground">{tCapacity('toggleHelp')}</p>
            </div>
            <Switch
              checked={sharedCapacityEnabled}
              onCheckedChange={(checked) => {
                setCapacityScope(checked ? 'shared_pool' : 'per_distance');
                setCapacityError(null);
              }}
              disabled={isUpdatingCapacity}
            />
          </div>

          {sharedCapacityEnabled && (
            <FormField label={tCapacity('sharedCapacityLabel')} error={capacityError}>
              <div className="space-y-2">
                <input
                  type="number"
                  min="1"
                  value={sharedCapacityValue}
                  onChange={(event) => setSharedCapacityValue(event.target.value)}
                  placeholder={tCapacity('sharedCapacityPlaceholder')}
                  className="w-full max-w-xs rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  disabled={isUpdatingCapacity}
                />
                <p className="text-xs text-muted-foreground">{tCapacity('sharedCapacityHelp')}</p>
              </div>
            </FormField>
          )}

          {!sharedCapacityEnabled && capacityError && (
            <p className="text-sm text-destructive">{capacityError}</p>
          )}

          <div className="flex justify-end">
            <Button type="button" onClick={handleCapacitySave} disabled={isUpdatingCapacity}>
              {isUpdatingCapacity ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {tCapacity('save')}
            </Button>
          </div>
        </div>
      </section>

      {/* Distances Section */}
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('distances.title')}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDistance(true)}
            disabled={showAddDistance}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('distances.add')}
          </Button>
        </div>

        {showAddDistance && (
          <AddDistanceForm
            eventId={event.id}
            sharedCapacityEnabled={sharedCapacityEnabled}
            onSuccess={(newDistance) => {
              setDistances([...distances, newDistance]);
              setShowAddDistance(false);
              startTransition(() => {
                router.refresh();
              });
            }}
            onCancel={() => setShowAddDistance(false)}
          />
        )}

        {distances.length === 0 && !showAddDistance ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {t('distances.empty')}
          </p>
        ) : (
          <div className="divide-y">
            {distances.map((distance) => (
              <DistanceItem
                key={distance.id}
                distance={distance}
                isEditing={editingDistanceId === distance.id}
                sharedCapacityEnabled={sharedCapacityEnabled}
                onEdit={() => setEditingDistanceId(distance.id)}
                onCancelEdit={() => setEditingDistanceId(null)}
                onUpdate={(updated) => {
                  setDistances(distances.map((d) => (d.id === updated.id ? updated : d)));
                  setEditingDistanceId(null);
                  startTransition(() => {
                    router.refresh();
                  });
                }}
                onDelete={() => {
                  setDistances(distances.filter((d) => d.id !== distance.id));
                  startTransition(() => {
                    router.refresh();
                  });
                }}
              />
            ))}
          </div>
        )}
      </section>

      <Dialog open={showSlugConfirm} onOpenChange={setShowSlugConfirm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('details.slugConfirm.title')}</DialogTitle>
            <DialogDescription>{t('details.slugConfirm.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowSlugConfirm(false)}
              disabled={detailsForm.isSubmitting}
            >
              {t('details.slugConfirm.cancel')}
            </Button>
            <Button
              type="button"
              onClick={confirmSlugChange}
              disabled={detailsForm.isSubmitting}
            >
              {t('details.slugConfirm.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper functions
function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDateTimeForInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}

// Add Distance Form
function AddDistanceForm({
  eventId,
  sharedCapacityEnabled,
  onSuccess,
  onCancel,
}: {
  eventId: string;
  sharedCapacityEnabled: boolean;
  onSuccess: (distance: EventDistanceDetail) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('pages.dashboardEventSettings.distances');
  const tCapacity = useTranslations('pages.dashboardEventSettings.capacity');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const terrainValue = formData.get('terrain') as string;
    const capacityValue = sharedCapacityEnabled
      ? undefined
      : formData.get('capacity')
        ? Number(formData.get('capacity'))
        : undefined;
    const result = await createDistance({
      editionId: eventId,
      label: formData.get('label') as string,
      distanceValue: formData.get('distanceValue')
        ? Number(formData.get('distanceValue'))
        : undefined,
      distanceUnit: 'km',
      kind: 'distance',
      isVirtual: false,
      capacityScope: sharedCapacityEnabled ? 'shared_pool' : 'per_distance',
      terrain: terrainValue ? (terrainValue as TerrainType) : undefined,
      capacity: capacityValue,
      priceCents: Math.round(Number(formData.get('price')) * 100),
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSuccess({
      id: result.data.id,
      label: result.data.label,
      distanceValue: result.data.distanceValue,
      distanceUnit: result.data.distanceUnit,
      kind: result.data.kind,
      startTimeLocal: null,
      timeLimitMinutes: null,
      terrain: null,
      isVirtual: result.data.isVirtual,
      capacity: result.data.capacity,
      capacityScope: result.data.capacityScope,
      sortOrder: 0,
      priceCents: Math.round(Number(formData.get('price')) * 100),
      currency: 'MXN',
      registrationCount: 0,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 mb-4 space-y-4 bg-muted/50">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormField label={t('labelField')} required>
          <input
            type="text"
            name="label"
            required
            placeholder="10K"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            disabled={isSubmitting}
          />
        </FormField>

        <FormField label={t('distanceValue')}>
          <input
            type="number"
            name="distanceValue"
            step="0.1"
            placeholder="10"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            disabled={isSubmitting}
          />
        </FormField>

        <FormField label={t('terrain')}>
          <select
            name="terrain"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            disabled={isSubmitting}
          >
            <option value="">-</option>
            {TERRAIN_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label={t('price')} required>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <input
              type="number"
              name="price"
              required
              step="0.01"
              min="0"
              placeholder="500.00"
              className="w-full rounded-md border bg-background pl-7 pr-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={isSubmitting}
            />
          </div>
        </FormField>
        {sharedCapacityEnabled ? (
          <div className="text-xs text-muted-foreground flex items-center">
            {tCapacity('sharedPoolHint')}
          </div>
        ) : (
          <FormField label={t('capacity')}>
            <input
              type="number"
              name="capacity"
              min="1"
              placeholder={t('unlimited')}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={isSubmitting}
            />
          </FormField>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          <X className="h-4 w-4 mr-1" />
          {t('cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          {t('addDistance')}
        </Button>
      </div>
    </form>
  );
}

// Distance Item Component
function DistanceItem({
  distance,
  isEditing,
  sharedCapacityEnabled,
  onEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: {
  distance: EventDistanceDetail;
  isEditing: boolean;
  sharedCapacityEnabled: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (updated: EventDistanceDetail) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('pages.dashboardEventSettings.distances');
  const tCapacity = useTranslations('pages.dashboardEventSettings.capacity');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    const result = await deleteDistance({ distanceId: distance.id });
    setIsDeleting(false);
    setShowDeleteDialog(false);

    if (result.ok) {
      onDelete();
    } else {
      setError(result.error);
    }
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsUpdating(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const newPriceCents = Math.round(Number(formData.get('price')) * 100);
    const terrainValue = formData.get('terrain') as string;
    const distanceValue = formData.get('distanceValue') as string;
    const capacityValue = sharedCapacityEnabled
      ? undefined
      : formData.get('capacity')
        ? Number(formData.get('capacity'))
        : null;

    // Update distance
    const distanceResult = await updateDistance({
      distanceId: distance.id,
      label: formData.get('label') as string,
      distanceValue: distanceValue ? Number(distanceValue) : null,
      terrain: terrainValue ? (terrainValue as TerrainType) : null,
      ...(sharedCapacityEnabled ? {} : { capacity: capacityValue }),
    });

    // Update price if changed
    if (distanceResult.ok && newPriceCents !== distance.priceCents) {
      await updateDistancePrice({
        distanceId: distance.id,
        priceCents: newPriceCents,
      });
    }

    setIsUpdating(false);

    if (!distanceResult.ok) {
      setError(distanceResult.error);
      return;
    }

    onUpdate({
      ...distance,
      label: formData.get('label') as string,
      distanceValue: distanceValue || null,
      terrain: terrainValue || null,
      ...(sharedCapacityEnabled ? {} : { capacity: capacityValue ?? null }),
      priceCents: newPriceCents,
    });
  }

  if (isEditing) {
    return (
      <form onSubmit={handleUpdate} className="py-4 space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label={t('labelField')}>
            <input
              type="text"
              name="label"
              defaultValue={distance.label}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={isUpdating}
            />
          </FormField>

          <FormField label={t('distanceValue')}>
            <input
              type="number"
              name="distanceValue"
              step="0.1"
              defaultValue={distance.distanceValue || ''}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={isUpdating}
            />
          </FormField>

          <FormField label={t('terrain')}>
            <select
              name="terrain"
              defaultValue={distance.terrain || ''}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={isUpdating}
            >
              <option value="">-</option>
              {TERRAIN_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label={t('price')}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <input
                type="number"
                name="price"
                step="0.01"
                min="0"
                defaultValue={(distance.priceCents / 100).toFixed(2)}
                className="w-full rounded-md border bg-background pl-7 pr-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                disabled={isUpdating}
              />
            </div>
          </FormField>

          {sharedCapacityEnabled ? (
            <div className="text-xs text-muted-foreground flex items-center">
              {tCapacity('sharedPoolHint')}
            </div>
          ) : (
            <FormField label={t('capacity')}>
              <input
                type="number"
                name="capacity"
                min="1"
                defaultValue={distance.capacity || ''}
                placeholder={t('unlimited')}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                disabled={isUpdating}
              />
            </FormField>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancelEdit}
            disabled={isUpdating}
          >
            <X className="h-4 w-4 mr-1" />
            {t('cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={isUpdating}>
            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {t('save')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="py-4 flex items-center justify-between">
      <div>
        <h3 className="font-medium">{distance.label}</h3>
        <p className="text-sm text-muted-foreground">
          {distance.distanceValue} {distance.distanceUnit}
          {distance.terrain && ` • ${distance.terrain}`}
          {sharedCapacityEnabled
            ? ` • ${tCapacity('sharedPoolTag')}`
            : distance.capacity
              ? ` • ${distance.capacity} spots`
              : ''}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-medium">
            ${(distance.priceCents / 100).toFixed(2)} {distance.currency}
          </p>
          <p className="text-sm text-muted-foreground">
            {distance.registrationCount} {t('registered')}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDeleteDialog(true)}
            disabled={isDeleting || distance.registrationCount > 0}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 text-destructive" />
            )}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}

      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t('deleteTitle')}
        description={t('confirmDelete')}
        itemName={distance.label}
        itemDetail={
          distance.distanceValue ? `${distance.distanceValue} ${distance.distanceUnit}` : undefined
        }
        onConfirm={handleDelete}
        isPending={isDeleting}
      />
    </div>
  );
}
