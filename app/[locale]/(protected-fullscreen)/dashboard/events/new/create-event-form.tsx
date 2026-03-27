'use client';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FormField } from '@/components/ui/form-field';
import { IconButton } from '@/components/ui/icon-button';
import { MarkdownField } from '@/components/ui/markdown-field';
import { InsetSurface, Surface } from '@/components/ui/surface';
import { Badge } from '@/components/common';
import { createEventStepAction } from '@/app/actions/events-create';
import { useRouter } from '@/i18n/navigation';
import { createOrganization } from '@/lib/organizations/actions';
import { checkSlugAvailability } from '@/lib/events/actions';
import { SPORT_TYPES, type SportType } from '@/lib/events/constants';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarPlus,
  Check,
  ChevronDown,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  showAiContextDisclosure: boolean;
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

function mapOrganizationCreateError(
  t: ReturnType<typeof useTranslations<'pages.dashboardEvents.createEvent'>>,
  code?: string,
) {
  switch (code) {
    case 'SLUG_TAKEN':
      return t('organization.errors.slugTaken');
    case 'FORBIDDEN':
      return t('organization.errors.forbidden');
    case 'UNAUTHENTICATED':
      return t('organization.errors.unauthenticated');
    case 'VALIDATION_ERROR':
      return t('organization.errors.validationFailed');
    default:
      return t('organization.errors.createFailed');
  }
}

function mapSeriesCreateError(
  t: ReturnType<typeof useTranslations<'pages.dashboardEvents.createEvent'>>,
  code?: string,
) {
  switch (code) {
    case 'SLUG_TAKEN':
      return t('event.errors.seriesSlugTaken');
    case 'FORBIDDEN':
      return t('event.errors.forbidden');
    case 'UNAUTHENTICATED':
      return t('event.errors.unauthenticated');
    case 'VALIDATION_ERROR':
      return t('event.errors.validationFailed');
    default:
      return t('event.errors.seriesCreateFailed');
  }
}

function mapEditionCreateError(
  t: ReturnType<typeof useTranslations<'pages.dashboardEvents.createEvent'>>,
  code?: string,
) {
  switch (code) {
    case 'SLUG_TAKEN':
      return t('event.errors.editionSlugTaken');
    case 'LABEL_TAKEN':
      return t('event.errors.editionLabelTaken');
    case 'FORBIDDEN':
      return t('event.errors.forbidden');
    case 'UNAUTHENTICATED':
      return t('event.errors.unauthenticated');
    case 'VALIDATION_ERROR':
      return t('event.errors.validationFailed');
    default:
      return t('event.errors.editionCreateFailed');
  }
}

function mapEventValidationFieldErrors(
  t: ReturnType<typeof useTranslations<'pages.dashboardEvents.createEvent'>>,
  fieldErrors?: Record<string, string[]>,
) {
  if (!fieldErrors) return undefined;

  const requiredMessage = t('event.errors.validationFailed');

  return Object.fromEntries(
    Object.entries(fieldErrors).map(([field, messages]) => {
      const localized = messages.map((message) => {
        switch (message) {
          case 'SERIES_REQUIRED':
          case 'SERIES_NAME_REQUIRED':
          case 'SERIES_SLUG_REQUIRED':
          case 'EDITION_LABEL_REQUIRED':
          case 'EDITION_SLUG_REQUIRED':
            return requiredMessage;
          default:
            return requiredMessage;
        }
      });

      return [field, localized];
    }),
  );
}

export function CreateEventForm({ organizations, showAiContextDisclosure }: CreateEventFormProps) {
  const t = useTranslations('pages.dashboardEvents.createEvent');
  const tSlug = useTranslations('pages.dashboardEvents');
  const tSport = useTranslations('pages.dashboardEvents.sportTypes');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [step, setStep] = useState<Step>('organization');
  const [isAiContextOpen, setIsAiContextOpen] = useState(false);

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
  const selectedSeries = useMemo(
    () => selectedOrg?.series.find((series) => series.id === selectedSeriesId) ?? null,
    [selectedOrg, selectedSeriesId],
  );

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
          setOrgError(mapOrganizationCreateError(t, result.code));
          setIsCreatingOrg(false);
          return;
        }

        // Update selected org with newly created one
        setSelectedOrgId(result.data.id);
        setShowNewOrg(false);
      } catch {
        setOrgError(t('organization.errors.createFailed'));
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
      organizerBrief: string;
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
      organizerBrief: '',
      startsAt: '',
      city: '',
      state: '',
      latitude: '',
      longitude: '',
      locationDisplay: '',
    },
    onSubmit: async (values) => {
      if (!selectedOrgId) {
        return { ok: false, error: 'VALIDATION_ERROR', message: t('organization.errors.required') };
      }

      if ((showNewSeries && seriesSlugStatus === 'taken') || editionSlugStatus === 'taken') {
        return { ok: false, error: 'VALIDATION_ERROR', message: tSlug('slugStatus.taken') };
      }

      const result = await createEventStepAction({
        organizationId: selectedOrgId,
        selectedSeriesId,
        showNewSeries,
        seriesName: values.seriesName,
        seriesSlug: values.seriesSlug,
        sportType: values.sportType,
        editionLabel: values.editionLabel,
        editionSlug: values.editionSlug,
        description: values.description,
        organizerBrief: values.organizerBrief,
        startsAt: values.startsAt,
        city: values.city,
        state: values.state,
        latitude: values.latitude,
        longitude: values.longitude,
        locationDisplay: values.locationDisplay,
        showAiContextDisclosure,
      });

      if (!result.ok) {
        if (result.error === 'INVALID_INPUT') {
          const fieldErrors = 'fieldErrors' in result ? result.fieldErrors : undefined;

          return {
            ok: false,
            error: 'INVALID_INPUT',
            fieldErrors: mapEventValidationFieldErrors(t, fieldErrors),
            message: t('event.errors.validationFailed'),
          };
        }

        if (result.message === 'SLUG_TAKEN') {
          return {
            ok: false,
            error: 'SERVER_ERROR',
            message: showNewSeries
              ? mapSeriesCreateError(t, result.message)
              : t('event.errors.editionSlugTaken'),
          };
        }

        if (result.message === 'LABEL_TAKEN') {
          return {
            ok: false,
            error: 'SERVER_ERROR',
            message: mapEditionCreateError(t, result.message),
          };
        }

        if (result.message === 'FORBIDDEN' || result.message === 'UNAUTHENTICATED') {
          return {
            ok: false,
            error: result.message,
            message: t(
              `event.errors.${result.message === 'FORBIDDEN' ? 'forbidden' : 'unauthenticated'}`,
            ),
          };
        }

        return {
          ok: false,
          error: 'SERVER_ERROR',
          message: showNewSeries
            ? mapSeriesCreateError(t, result.message)
            : mapEditionCreateError(t, result.message),
        };
      }

      return result;
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

      if (!result || !result.ok) {
        setSeriesSlugStatus('error');
        return;
      }

      setSeriesSlugStatus(result.data.available ? 'available' : 'taken');
    }, 400);
  }

  const handleEditionSlugChange = useCallback(
    (nextSlug: string, seriesIdOverride?: string) => {
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

        if (!result || !result.ok) {
          setEditionSlugStatus('error');
          return;
        }

        setEditionSlugStatus(result.data.available ? 'available' : 'taken');
      }, 400);
    },
    [selectedSeriesId, showNewSeries],
  );

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

  // Memoize callbacks to prevent infinite re-renders in Popover
  const handleSelectNewSeries = useCallback(() => {
    // Defer state updates to allow Popover to close cleanly
    setTimeout(() => {
      setShowNewSeries(true);
      setSelectedSeriesId(null);
      setSeriesSlugStatus('idle');
      setEditionSlugStatus('idle');
    }, 0);
  }, []);

  const handleSelectSeries = useCallback((seriesId: string) => {
    // Defer state updates to allow Popover to close cleanly
    setTimeout(() => {
      setShowNewSeries(false);
      setSelectedSeriesId(seriesId);
      setSeriesSlugStatus('idle');
    }, 0);
  }, []);

  // Note: Edition slug validation will happen when user manually changes the slug field
  // This avoids infinite loops while still providing validation feedback

  // When selecting existing series, populate sport type
  useEffect(() => {
    if (selectedSeriesId && selectedOrg) {
      const series = selectedOrg.series.find((s) => s.id === selectedSeriesId);
      if (series) {
        form.setFieldValue('sportType', series.sportType as SportType);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeriesId, selectedOrg]);

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/80 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
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
        <Surface className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">{t('organization.title')}</h2>
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
                    'w-full rounded-xl border p-4 text-left transition-colors',
                    selectedOrgId === org.id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/50 hover:bg-muted/20',
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{org.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('organization.seriesCount', { count: org.series.length })}
                      </p>
                    </div>
                    {selectedOrgId === org.id && (
                      <Check className="h-5 w-5 flex-shrink-0 text-primary" />
                    )}
                  </div>
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setShowNewOrg(true);
                  setSelectedOrgId(null);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
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

              <FormField label={t('organization.nameLabel')} required error={orgError}>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => handleOrgNameChange(e.target.value)}
                  placeholder={t('organization.namePlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  disabled={isCreatingOrg}
                />
              </FormField>

              <FormField label={t('organization.slugLabel')} required>
                <input
                  type="text"
                  value={newOrgSlug}
                  onChange={(e) => handleOrgSlugChange(e.target.value)}
                  placeholder={t('organization.slugPlaceholder')}
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
        </Surface>
      )}

      {/* Event step */}
      {step === 'event' && (
        <Form form={form} className="space-y-6">
          <Surface className="space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <IconButton
                    label={tCommon('goBack')}
                    variant="ghost"
                    size="icon"
                    onClick={() => setStep('organization')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </IconButton>
                  <h2 className="text-xl font-semibold tracking-tight">{t('event.title')}</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('event.organizationLabel')}: {selectedOrg?.name}
                </p>
              </div>

              <InsetSurface className="grid gap-3 sm:min-w-72 sm:max-w-80">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('steps.organization')}
                  </p>
                  <p className="text-sm font-medium text-foreground">{selectedOrg?.name}</p>
                </div>
                <div className="space-y-1 border-t border-border/60 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('event.seriesLabel')}
                  </p>
                  <p className="text-sm text-foreground">
                    {showNewSeries
                      ? t('event.seriesNamePlaceholder')
                      : (selectedSeries?.name ?? t('event.seriesLabel'))}
                  </p>
                </div>
              </InsetSurface>
            </div>

            <FormError />
          </Surface>

          <SectionCard title={t('event.seriesLabel')}>
            {/* Series selection/creation */}
            {selectedOrg && selectedOrg.series.length > 0 && (
              <FormField label={t('event.seriesLabel')}>
                <SeriesCombobox
                  key={`${showNewSeries}-${selectedSeriesId || 'new'}`}
                  series={selectedOrg.series}
                  selectedSeriesId={selectedSeriesId}
                  showNewSeries={showNewSeries}
                  onSelectNewSeries={handleSelectNewSeries}
                  onSelectSeries={handleSelectSeries}
                  disabled={form.isSubmitting}
                />
              </FormField>
            )}

            {/* New series fields */}
            {showNewSeries && (
              <div className="grid gap-4">
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
                      placeholder={t('event.seriesSlugPlaceholder')}
                      className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
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

                <FormField label={t('event.sportTypeLabel')} required error={form.errors.sportType}>
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
              </div>
            )}
          </SectionCard>

          <SectionCard title={t('event.editionDetails')}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

            <MarkdownField
              label={t('event.descriptionLabel')}
              value={form.values.description}
              onChange={(value) => form.setFieldValue('description', value)}
              error={form.errors.description}
              disabled={form.isSubmitting}
              textareaClassName="resize-none"
              helperText={t('event.descriptionHelper')}
              textareaProps={{
                placeholder: t('event.descriptionPlaceholder'),
                rows: 4,
              }}
            />

            {showAiContextDisclosure ? (
              <div className="rounded-2xl border border-[var(--brand-gold)]/30 bg-[var(--brand-gold)]/5 p-4">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-4 text-left"
                  aria-expanded={isAiContextOpen}
                  onClick={() => setIsAiContextOpen((current) => !current)}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Sparkles className="h-4 w-4 text-[var(--brand-gold-dark)]" />
                        <span>{t('event.aiContextTrigger')}</span>
                      </div>
                      <Badge variant="pro" size="sm">
                        {tCommon('billing.pro')}
                      </Badge>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {t('event.aiContextDescription')}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      'mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform',
                      isAiContextOpen && 'rotate-180',
                    )}
                  />
                </button>

                {isAiContextOpen ? (
                  <div className="mt-4 border-t border-[var(--brand-gold)]/20 pt-4">
                    <FormField label={t('event.aiContextLabel')}>
                      <div className="space-y-2">
                        <textarea
                          value={form.values.organizerBrief}
                          onChange={(event) =>
                            form.setFieldValue('organizerBrief', event.target.value)
                          }
                          placeholder={t('event.aiContextPlaceholder')}
                          className="min-h-[144px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                          disabled={form.isSubmitting}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('event.aiContextHelper')}
                        </p>
                      </div>
                    </FormField>
                  </div>
                ) : null}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title={t('event.dateLabel')} description={t('event.locationLabel')}>
            <FormField label={t('event.dateLabel')} error={form.errors.startsAt}>
              <DatePicker
                locale={locale}
                value={form.values.startsAt}
                onChangeAction={(value) => form.setFieldValue('startsAt', value)}
                clearLabel={t('event.clearDate')}
              />
            </FormField>

            <InsetSurface className="bg-muted/25">
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
                onLocationChangeAction={(
                  location: {
                    lat: number;
                    lng: number;
                    formattedAddress?: string | null;
                    city?: string | null;
                    region?: string | null;
                  } | null,
                ) => {
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
            </InsetSurface>
          </SectionCard>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={form.isSubmitting || isSeriesSlugTaken || isEditionSlugTaken}
            >
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
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
          status === 'complete' && 'border-primary bg-primary text-primary-foreground',
          status === 'current' && 'border-primary bg-primary/10 text-primary',
          status === 'pending' && 'border-border bg-muted text-muted-foreground',
        )}
      >
        {status === 'complete' ? <Check className="h-4 w-4" /> : number}
      </div>
      <span
        className={cn(
          'text-sm font-medium',
          status === 'pending' && 'text-muted-foreground',
          status !== 'pending' && 'text-foreground',
        )}
      >
        {label}
      </span>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Surface className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </Surface>
  );
}
