'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { useRouter } from '@/i18n/navigation';
import {
  updateEventEdition,
  updateEventVisibility,
  setRegistrationPaused,
  createDistance,
  updateDistance,
  deleteDistance,
  updateDistancePrice,
} from '@/lib/events/actions';
import { TERRAIN_TYPES, EVENT_VISIBILITY, type TerrainType } from '@/lib/events/constants';
import type { EventEditionDetail, EventDistanceDetail } from '@/lib/events/queries';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import {
  Calendar,
  Check,
  Eye,
  Loader2,
  MapPin,
  Pause,
  Play,
  Plus,
  Save,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

type EventSettingsFormProps = {
  event: EventEditionDetail;
};

type VisibilityType = 'draft' | 'published' | 'unlisted' | 'archived';

const visibilityStyles: Record<VisibilityType, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  unlisted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  archived: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export function EventSettingsForm({ event }: EventSettingsFormProps) {
  const t = useTranslations('pages.dashboard.events.settings');
  const tVis = useTranslations('pages.dashboard.events.visibility');
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Event details form
  const detailsForm = useForm<{
    editionLabel: string;
    slug: string;
    startsAt: string;
    endsAt: string;
    city: string;
    state: string;
    locationDisplay: string;
    address: string;
    externalUrl: string;
    registrationOpensAt: string;
    registrationClosesAt: string;
  }>({
    defaultValues: {
      editionLabel: event.editionLabel,
      slug: event.slug,
      startsAt: event.startsAt ? formatDateForInput(event.startsAt) : '',
      endsAt: event.endsAt ? formatDateForInput(event.endsAt) : '',
      city: event.city || '',
      state: event.state || '',
      locationDisplay: event.locationDisplay || '',
      address: event.address || '',
      externalUrl: event.externalUrl || '',
      registrationOpensAt: event.registrationOpensAt ? formatDateTimeForInput(event.registrationOpensAt) : '',
      registrationClosesAt: event.registrationClosesAt ? formatDateTimeForInput(event.registrationClosesAt) : '',
    },
    onSubmit: async (values) => {
      const result = await updateEventEdition({
        editionId: event.id,
        editionLabel: values.editionLabel || undefined,
        slug: values.slug || undefined,
        startsAt: values.startsAt ? new Date(values.startsAt).toISOString() : null,
        endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null,
        city: values.city || null,
        state: values.state || null,
        locationDisplay: values.locationDisplay || null,
        address: values.address || null,
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
  const [showAddDistance, setShowAddDistance] = useState(false);
  const [editingDistanceId, setEditingDistanceId] = useState<string | null>(null);

  return (
    <div className="space-y-8">
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

      {/* Event Details Section */}
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t('details.title')}</h2>
        </div>

        <Form form={detailsForm} className="space-y-6">
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
              <input
                type="text"
                {...detailsForm.register('slug')}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 font-mono"
                disabled={detailsForm.isSubmitting}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('details.startsAt')} error={detailsForm.errors.startsAt}>
              <input
                type="date"
                {...detailsForm.register('startsAt')}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                disabled={detailsForm.isSubmitting}
              />
            </FormField>

            <FormField label={t('details.endsAt')} error={detailsForm.errors.endsAt}>
              <input
                type="date"
                {...detailsForm.register('endsAt')}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                disabled={detailsForm.isSubmitting}
              />
            </FormField>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium">{t('details.locationSection')}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label={t('details.city')} error={detailsForm.errors.city}>
                <input
                  type="text"
                  {...detailsForm.register('city')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  disabled={detailsForm.isSubmitting}
                />
              </FormField>

              <FormField label={t('details.state')} error={detailsForm.errors.state}>
                <input
                  type="text"
                  {...detailsForm.register('state')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  disabled={detailsForm.isSubmitting}
                />
              </FormField>
            </div>

            <div className="mt-4">
              <FormField label={t('details.address')} error={detailsForm.errors.address}>
                <input
                  type="text"
                  {...detailsForm.register('address')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  disabled={detailsForm.isSubmitting}
                />
              </FormField>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-4">{t('details.registrationWindow')}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label={t('details.registrationOpensAt')}
                error={detailsForm.errors.registrationOpensAt}
              >
                <input
                  type="datetime-local"
                  {...detailsForm.register('registrationOpensAt')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  disabled={detailsForm.isSubmitting}
                />
              </FormField>

              <FormField
                label={t('details.registrationClosesAt')}
                error={detailsForm.errors.registrationClosesAt}
              >
                <input
                  type="datetime-local"
                  {...detailsForm.register('registrationClosesAt')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  disabled={detailsForm.isSubmitting}
                />
              </FormField>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={detailsForm.isSubmitting}>
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
  onSuccess,
  onCancel,
}: {
  eventId: string;
  onSuccess: (distance: EventDistanceDetail) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('pages.dashboard.events.settings.distances');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const terrainValue = formData.get('terrain') as string;
    const result = await createDistance({
      editionId: eventId,
      label: formData.get('label') as string,
      distanceValue: formData.get('distanceValue')
        ? Number(formData.get('distanceValue'))
        : undefined,
      distanceUnit: 'km',
      kind: 'distance',
      isVirtual: false,
      capacityScope: 'per_distance',
      terrain: terrainValue ? (terrainValue as TerrainType) : undefined,
      capacity: formData.get('capacity') ? Number(formData.get('capacity')) : undefined,
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
      capacityScope: 'per_distance',
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
  onEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: {
  distance: EventDistanceDetail;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (updated: EventDistanceDetail) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('pages.dashboard.events.settings.distances');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(t('confirmDelete'))) return;

    setIsDeleting(true);
    const result = await deleteDistance({ distanceId: distance.id });
    setIsDeleting(false);

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

    // Update distance
    const distanceResult = await updateDistance({
      distanceId: distance.id,
      label: formData.get('label') as string,
      distanceValue: distanceValue ? Number(distanceValue) : null,
      terrain: terrainValue ? (terrainValue as TerrainType) : null,
      capacity: formData.get('capacity') ? Number(formData.get('capacity')) : null,
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
      capacity: formData.get('capacity') ? Number(formData.get('capacity')) : null,
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
          {distance.capacity && ` • ${distance.capacity} spots`}
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
            onClick={handleDelete}
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
    </div>
  );
}
