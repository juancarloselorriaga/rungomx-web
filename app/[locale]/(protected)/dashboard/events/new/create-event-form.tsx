'use client';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FormField } from '@/components/ui/form-field';
import { useRouter } from '@/i18n/navigation';
import { createOrganization } from '@/lib/organizations/actions';
import { checkSlugAvailability, createEventSeries, createEventEdition } from '@/lib/events/actions';
import { SPORT_TYPES, type SportType } from '@/lib/events/constants';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight, Building2, CalendarPlus, Check, Loader2 } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { SeriesCombobox } from '@/components/events/series-combobox';

const LocationField = dynamic(
  () => import('@/components/location/location-field').then((mod) => mod.LocationField),
  { ssr: false, loading: () => <div className="h-10 rounded-md border bg-muted animate-pulse" /> },
);

type EventSeriesSummary = {
  id: string;
  name: string;
  slug: string;
  sportType: string;
};

type OrganizationWithSeries = {
  id: string;
  name: string;
  slug: string;
  role: string;
  series: EventSeriesSummary[];
};

type CreateEventFormProps = {
  organizations: OrganizationWithSeries[];
};

type Step = 'organization' | 'event';
type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

// Utility to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function CreateEventForm({ organizations }: CreateEventFormProps) {
  const t = useTranslations('pages.dashboard.events.createEvent');
  const tSlug = useTranslations('pages.dashboard.events');
  const tSport = useTranslations('pages.dashboard.events.sportTypes');
  const router = useRouter();
  const [step, setStep] = useState<Step>('organization');

  // Organization step state
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(
    organizations.length === 1 ? organizations[0].id : null,
  );
  const [showNewOrg, setShowNewOrg] = useState(organizations.length === 0);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [orgSlugManuallyEdited, setOrgSlugManuallyEdited] = useState(false);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Handle organization name change with auto-slug
  function handleOrgNameChange(name: string) {
    setNewOrgName(name);
    // Auto-generate slug if not manually edited
    if (!orgSlugManuallyEdited) {
      setNewOrgSlug(generateSlug(name));
    }
  }

  function handleOrgSlugChange(slug: string) {
    setOrgSlugManuallyEdited(true);
    setNewOrgSlug(slug.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  }

  // Find selected organization
  const selectedOrg = useMemo(
    () => organizations.find((org) => org.id === selectedOrgId) || null,
    [organizations, selectedOrgId],
  );

  // Event step state  
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [showNewSeries, setShowNewSeries] = useState(true);
  const [seriesSlugStatus, setSeriesSlugStatus] = useState<SlugStatus>('idle');
  const [editionSlugStatus, setEditionSlugStatus] = useState<SlugStatus>('idle');
  const seriesSlugTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editionSlugTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seriesSlugRequestIdRef = useRef(0);
  const editionSlugRequestIdRef = useRef(0);

  // Validate organization step
  const canProceedToEvent = showNewOrg
    ? newOrgName.trim().length >= 2 && newOrgSlug.length >= 2
    : selectedOrgId !== null;

  // Handle proceeding to event step (may need to create org first)
  async function handleProceedToEvent() {
    setOrgError(null);

    if (showNewOrg) {
      // Create new organization
      setIsCreatingOrg(true);
      try {
        const result = await createOrganization({
          name: newOrgName.trim(),
          slug: newOrgSlug.trim(),
        });

        if (!result.ok) {
          setOrgError(result.error);
          setIsCreatingOrg(false);
          return;
        }

        // Update selected org with newly created one
        setSelectedOrgId(result.data.id);
        setShowNewOrg(false);
      } catch {
        setOrgError('Failed to create organization');
        setIsCreatingOrg(false);
        return;
      }
      setIsCreatingOrg(false);
    }

    setStep('event');
  }

  // Event form
  const locale = useLocale();
  const form = useForm<
    {
      seriesName: string;
      seriesSlug: string;
      sportType: SportType;
      editionLabel: string;
      editionSlug: string;
      description: string;
      startsAt: string;
      city: string;
      state: string;
      latitude: string;
      longitude: string;
      locationDisplay: string;
    },
    { eventId: string }
  >({
    defaultValues: {
      seriesName: '',
      seriesSlug: '',
      sportType: 'trail_running',
      editionLabel: new Date().getFullYear().toString(),
      editionSlug: new Date().getFullYear().toString(),
      description: '',
      startsAt: '',
      city: '',
      state: '',
      latitude: '',
      longitude: '',
      locationDisplay: '',
    },
    onSubmit: async (values) => {
      if (!selectedOrgId) {
        return { ok: false, error: 'VALIDATION_ERROR', message: 'Organization required' };
      }

      if ((showNewSeries && seriesSlugStatus === 'taken') || editionSlugStatus === 'taken') {
        return { ok: false, error: 'VALIDATION_ERROR', message: tSlug('slugStatus.taken') };
      }

      let seriesId = selectedSeriesId;

      // Create new series if needed
      if (showNewSeries || !seriesId) {
        const seriesResult = await createEventSeries({
          organizationId: selectedOrgId,
          name: values.seriesName.trim(),
          slug: values.seriesSlug.trim(),
          sportType: values.sportType,
        });

        if (!seriesResult.ok) {
          return { ok: false, error: 'SERVER_ERROR', message: seriesResult.error };
        }

        seriesId = seriesResult.data.id;
      }

      // Create edition
      const editionResult = await createEventEdition({
        seriesId,
        editionLabel: values.editionLabel.trim(),
        slug: values.editionSlug.trim(),
        description: values.description.trim() || undefined,
        timezone: 'America/Mexico_City',
        country: 'MX',
        startsAt: values.startsAt ? new Date(values.startsAt).toISOString() : undefined,
        city: values.city.trim() || undefined,
        state: values.state.trim() || undefined,
        latitude: values.latitude || undefined,
        longitude: values.longitude || undefined,
        locationDisplay: values.locationDisplay || undefined,
      });

      if (!editionResult.ok) {
        return { ok: false, error: 'SERVER_ERROR', message: editionResult.error };
      }

      return { ok: true, data: { eventId: editionResult.data.id } };
    },
    onSuccess: (result) => {
      router.push({
        pathname: '/dashboard/events/[eventId]/settings',
        params: { eventId: result.eventId },
        query: { wizard: '1' },
      });
    },
  });

  // Track if series slug was manually edited
  const [seriesSlugManuallyEdited, setSeriesSlugManuallyEdited] = useState(false);

  // Handle series name change with auto-slug
  function handleSeriesNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value;
    const nextSlug = generateSlug(name);
    form.setFieldValue('seriesName', name);
    if (!seriesSlugManuallyEdited && showNewSeries) {
      form.setFieldValue('seriesSlug', nextSlug);
      scheduleSeriesSlugCheck(nextSlug);
    }
  }

  function handleSeriesSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextSlug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSeriesSlugManuallyEdited(true);
    form.setFieldValue('seriesSlug', nextSlug);
    scheduleSeriesSlugCheck(nextSlug);
  }

  function scheduleSeriesSlugCheck(nextSlug: string) {
    if (!showNewSeries) {
      setSeriesSlugStatus('idle');
      return;
    }

    const trimmed = nextSlug.trim();
    if (!selectedOrgId || trimmed.length < 2) {
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
        organizationId: selectedOrgId,
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

  function handleEditionSlugChange(nextSlug: string, seriesIdOverride?: string) {
    const seriesId = seriesIdOverride ?? selectedSeriesId;
    const trimmed = nextSlug.trim();
    if (showNewSeries || trimmed.length < 2 || !seriesId) {
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
        seriesId,
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

  const isSeriesSlugTaken =
    showNewSeries && form.values.seriesSlug.trim().length >= 2 && seriesSlugStatus === 'taken';
  const isEditionSlugTaken =
    !showNewSeries && form.values.editionSlug.trim().length >= 2 && editionSlugStatus === 'taken';
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
  const editionSlugField = form.register('editionSlug');

  // When selecting existing series, populate sport type
  useEffect(() => {
    if (selectedSeriesId && selectedOrg) {
      const series = selectedOrg.series.find((s) => s.id === selectedSeriesId);
      if (series) {
        form.setFieldValue('sportType', series.sportType as SportType);
      }
    }
  }, [form, selectedSeriesId, selectedOrg]);

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-4">
        <StepIndicator
          number={1}
          label={t('steps.organization')}
          status={step === 'organization' ? 'current' : 'complete'}
        />
        <div className="h-px flex-1 bg-border" />
        <StepIndicator
          number={2}
          label={t('steps.event')}
          status={step === 'event' ? 'current' : 'pending'}
        />
      </div>

      {/* Organization step */}
      {step === 'organization' && (
        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{t('organization.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('organization.description')}</p>
          </div>

          {/* Existing organizations */}
          {organizations.length > 0 && !showNewOrg && (
            <div className="space-y-3">
              {organizations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => setSelectedOrgId(org.id)}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 rounded-lg border text-left transition-colors',
                    selectedOrgId === org.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{org.name}</p>
                    <p className="text-sm text-muted-foreground">{org.series.length} series</p>
                  </div>
                  {selectedOrgId === org.id && (
                    <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setShowNewOrg(true);
                  setSelectedOrgId(null);
                }}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Building2 className="h-4 w-4" />
                {t('organization.createNew')}
              </button>
            </div>
          )}

          {/* New organization form */}
          {showNewOrg && (
            <div className="space-y-4">
              {organizations.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowNewOrg(false);
                    setNewOrgName('');
                    setNewOrgSlug('');
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('organization.backToList')}
                </Button>
              )}

              <FormField
                label={t('organization.nameLabel')}
                required
                error={orgError}
              >
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => handleOrgNameChange(e.target.value)}
                  placeholder={t('organization.namePlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  disabled={isCreatingOrg}
                />
              </FormField>

              <FormField
                label={t('organization.slugLabel')}
                required
              >
                <input
                  type="text"
                  value={newOrgSlug}
                  onChange={(e) => handleOrgSlugChange(e.target.value)}
                  placeholder="my-organization"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 font-mono"
                  disabled={isCreatingOrg}
                />
              </FormField>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleProceedToEvent}
              disabled={!canProceedToEvent || isCreatingOrg}
            >
              {isCreatingOrg ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-2" />
              )}
              {t('steps.continue')}
            </Button>
          </div>
        </div>
      )}

      {/* Event step */}
      {step === 'event' && (
        <Form form={form} className="rounded-lg border bg-card p-6 shadow-sm space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setStep('organization')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h2 className="text-lg font-semibold">{t('event.title')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('event.organizationLabel')}: {selectedOrg?.name}
                </p>
              </div>
            </div>
          </div>

          <FormError />

          {/* Series selection/creation */}
          {selectedOrg && selectedOrg.series.length > 0 && (
            <FormField label={t('event.seriesLabel')}>
              <SeriesCombobox
                series={selectedOrg.series}
                selectedSeriesId={selectedSeriesId}
                showNewSeries={showNewSeries}
                onSelectNewSeries={() => {
                  setShowNewSeries(true);
                  setSelectedSeriesId(null);
                  setSeriesSlugStatus('idle');
                  setEditionSlugStatus('idle');
                }}
                onSelectSeries={(seriesId) => {
                  setShowNewSeries(false);
                  setSelectedSeriesId(seriesId);
                  setSeriesSlugStatus('idle');
                  handleEditionSlugChange(form.values.editionSlug, seriesId);
                }}
                disabled={form.isSubmitting}
              />
            </FormField>
          )}

          {/* New series fields */}
          {showNewSeries && (
            <>
              <FormField
                label={t('event.seriesNameLabel')}
                required
                error={form.errors.seriesName}
              >
                <input
                  type="text"
                  value={form.values.seriesName}
                  onChange={handleSeriesNameChange}
                  placeholder={t('event.seriesNamePlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  disabled={form.isSubmitting}
                />
              </FormField>

              <FormField
                label={t('event.seriesSlugLabel')}
                required
                error={form.errors.seriesSlug}
              >
                <div className="space-y-1">
                  <input
                    type="text"
                    value={form.values.seriesSlug}
                    onChange={handleSeriesSlugChange}
                    placeholder="ultra-trail-mx"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 font-mono"
                    disabled={form.isSubmitting}
                  />
                  {showNewSeries &&
                    form.values.seriesSlug.trim().length >= 2 &&
                    seriesSlugStatus !== 'idle' && (
                    <p className={cn('text-xs', slugStatusClass(seriesSlugStatus))}>
                      {slugStatusLabel(seriesSlugStatus)}
                    </p>
                  )}
                </div>
              </FormField>

              <FormField
                label={t('event.sportTypeLabel')}
                required
                error={form.errors.sportType}
              >
                <select
                  {...form.register('sportType')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  disabled={form.isSubmitting}
                >
                  {SPORT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {tSport(type)}
                    </option>
                  ))}
                </select>
              </FormField>
            </>
          )}

          {/* Edition fields */}
          <div className="border-t pt-6 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">{t('event.editionDetails')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label={t('event.editionLabelLabel')}
                required
                error={form.errors.editionLabel}
              >
                <input
                  type="text"
                  {...form.register('editionLabel')}
                  placeholder="2025"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  disabled={form.isSubmitting}
                />
              </FormField>

              <FormField
                label={t('event.editionSlugLabel')}
                required
                error={form.errors.editionSlug}
              >
                <div className="space-y-1">
                  <input
                    type="text"
                    name={editionSlugField.name}
                    value={editionSlugField.value}
                    onChange={(event) => {
                      editionSlugField.onChange(event);
                      handleEditionSlugChange(event.target.value);
                    }}
                    placeholder="2025"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 font-mono"
                    disabled={form.isSubmitting}
                  />
                  {form.values.editionSlug.trim().length >= 2 && editionSlugStatus !== 'idle' && (
                    <p className={cn('text-xs', slugStatusClass(editionSlugStatus))}>
                      {slugStatusLabel(editionSlugStatus)}
                    </p>
                  )}
                </div>
              </FormField>
            </div>

            <FormField
              label={t('event.descriptionLabel')}
              error={form.errors.description}
            >
              <textarea
                {...form.register('description')}
                placeholder={t('event.descriptionPlaceholder')}
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 resize-none"
                disabled={form.isSubmitting}
              />
            </FormField>

            <FormField
              label={t('event.dateLabel')}
              error={form.errors.startsAt}
            >
              <DatePicker
                locale={locale}
                value={form.values.startsAt}
                onChangeAction={(value) => form.setFieldValue('startsAt', value)}
                clearLabel={t('event.clearDate')}
              />
            </FormField>

            <LocationField
              label={t('event.locationLabel')}
              location={
                form.values.latitude && form.values.longitude
                  ? {
                      lat: Number(form.values.latitude),
                      lng: Number(form.values.longitude),
                      formattedAddress: form.values.locationDisplay || '',
                    }
                  : null
              }
              country="MX"
              language={locale}
              onLocationChangeAction={(location) => {
                if (location) {
                  form.setFieldValue('latitude', String(location.lat));
                  form.setFieldValue('longitude', String(location.lng));
                  form.setFieldValue('locationDisplay', location.formattedAddress || '');
                  if (location.city) form.setFieldValue('city', location.city);
                  if (location.region) form.setFieldValue('state', location.region);
                } else {
                  form.setFieldValue('latitude', '');
                  form.setFieldValue('longitude', '');
                  form.setFieldValue('locationDisplay', '');
                  form.setFieldValue('city', '');
                  form.setFieldValue('state', '');
                }
              }}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={form.isSubmitting || isSeriesSlugTaken || isEditionSlugTaken}>
              {form.isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CalendarPlus className="h-4 w-4 mr-2" />
              )}
              {t('submit')}
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
}

// Step indicator component
function StepIndicator({
  number,
  label,
  status,
}: {
  number: number;
  label: string;
  status: 'pending' | 'current' | 'complete';
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
          status === 'complete' && 'bg-primary text-primary-foreground',
          status === 'current' && 'bg-primary text-primary-foreground',
          status === 'pending' && 'bg-muted text-muted-foreground',
        )}
      >
        {status === 'complete' ? <Check className="h-4 w-4" /> : number}
      </div>
      <span
        className={cn(
          'text-sm font-medium',
          status === 'pending' && 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </div>
  );
}
