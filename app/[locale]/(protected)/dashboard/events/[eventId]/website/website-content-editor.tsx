'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  Award,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Map,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { DocumentUploader, type UploadedDocument } from '@/components/events/document-uploader';
import { BulkPhotoUploader } from '@/components/events/bulk-photo-uploader';
import { SortablePhotoGrid, type PhotoItem } from '@/components/events/sortable-photo-grid';
import {
  SponsorLogoUploader,
  type UploadedSponsorLogo,
} from '@/components/events/sponsor-logo-uploader';
import { cn } from '@/lib/utils';
import { EVENT_MEDIA_MAX_FILE_SIZE } from '@/lib/events/media/constants';

import { getWebsiteContent, updateWebsiteContent } from '@/lib/events/website/actions';
import {
  DEFAULT_WEBSITE_BLOCKS,
  SPONSOR_DISPLAY_SIZES,
  type WebsiteContentBlocks,
  type CourseSection,
  type ScheduleSection,
  type MediaSection,
  type SponsorsSection,
  type SponsorTier,
  type Sponsor,
  type SponsorDisplaySize,
} from '@/lib/events/website/types';

type AidStation = NonNullable<CourseSection['aidStations']>[number];
type StartTime = NonNullable<ScheduleSection['startTimes']>[number];
type DocumentRef = NonNullable<MediaSection['documents']>[number];
type PhotoRef = NonNullable<MediaSection['photos']>[number];

interface WebsiteContentEditorProps {
  editionId: string;
  locale: string;
  organizationId: string;
}

export function WebsiteContentEditor({ editionId, locale, organizationId }: WebsiteContentEditorProps) {
  const t = useTranslations('pages.dashboardEventWebsite');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [blocks, setBlocks] = useState<WebsiteContentBlocks>(DEFAULT_WEBSITE_BLOCKS);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));
  const [showDocumentUploader, setShowDocumentUploader] = useState(false);
  const [showPhotoUploader, setShowPhotoUploader] = useState(false);
  // Track which tier is showing the sponsor uploader (by tier id)
  const [showSponsorUploader, setShowSponsorUploader] = useState<string | null>(null);

  // Load existing content on mount
  useEffect(() => {
    async function loadContent() {
      const result = await getWebsiteContent({ editionId, locale });
      if (result.ok && result.data) {
        setBlocks(result.data.blocks);
        setMediaUrls(result.data.mediaUrls ?? {});
        // Expand sections that have content
        const sectionsWithContent = new Set<string>();
        if (result.data.blocks.overview?.enabled) sectionsWithContent.add('overview');
        if (result.data.blocks.course?.enabled) sectionsWithContent.add('course');
        if (result.data.blocks.schedule?.enabled) sectionsWithContent.add('schedule');
        if (result.data.blocks.media?.enabled) sectionsWithContent.add('media');
        if (result.data.blocks.sponsors?.enabled) sectionsWithContent.add('sponsors');
        if (sectionsWithContent.size === 0) sectionsWithContent.add('overview');
        setExpandedSections(sectionsWithContent);
      }
      setIsLoading(false);
    }
    loadContent();
  }, [editionId, locale]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateWebsiteContent({ editionId, locale, blocks });
      if (result.ok) {
        toast.success(t('saved'));
        router.refresh();
      } else {
        toast.error(t('errorSaving'));
      }
    });
  };

  const updateOverview = (field: 'content' | 'terrain' | 'enabled', value: string | boolean) => {
    setBlocks((prev) => ({
      ...prev,
      overview: {
        ...prev.overview,
        type: 'overview' as const,
        enabled: prev.overview?.enabled ?? true,
        content: prev.overview?.content ?? '',
        [field]: value,
      },
    }));
  };

  const updateCourse = (
    field: keyof CourseSection,
    value: string | boolean | AidStation[] | undefined,
  ) => {
    setBlocks((prev) => ({
      ...prev,
      course: {
        ...prev.course,
        type: 'course' as const,
        enabled: prev.course?.enabled ?? false,
        [field]: value,
      },
    }));
  };

  const updateSchedule = (
    field: keyof ScheduleSection,
    value: string | boolean | StartTime[] | undefined,
  ) => {
    setBlocks((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        type: 'schedule' as const,
        enabled: prev.schedule?.enabled ?? false,
        [field]: value,
      },
    }));
  };

  const updateMedia = (
    field: keyof MediaSection,
    value: boolean | DocumentRef[] | PhotoRef[] | undefined,
  ) => {
    setBlocks((prev) => ({
      ...prev,
      media: {
        ...prev.media,
        type: 'media' as const,
        enabled: prev.media?.enabled ?? false,
        [field]: value,
      },
    }));
  };

  const updateSponsors = (
    field: keyof SponsorsSection,
    value: boolean | string | SponsorTier[] | undefined,
  ) => {
    setBlocks((prev) => ({
      ...prev,
      sponsors: {
        ...prev.sponsors,
        type: 'sponsors' as const,
        enabled: prev.sponsors?.enabled ?? false,
        tiers: prev.sponsors?.tiers ?? [],
        [field]: value,
      },
    }));
  };

  // Document helpers
  const handleDocumentUpload = (doc: UploadedDocument) => {
    const current = blocks.media?.documents ?? [];
    const newDoc: DocumentRef = {
      mediaId: doc.mediaId,
      label: doc.label,
      sortOrder: current.length,
    };
    updateMedia('documents', [...current, newDoc]);
    setShowDocumentUploader(false);
  };

  const removeDocument = (index: number) => {
    const current = blocks.media?.documents ?? [];
    updateMedia(
      'documents',
      current.filter((_, i) => i !== index),
    );
  };

  // Photo helpers
  const handleBulkPhotoUpload = (results: Array<{ mediaId: string; blobUrl: string }>) => {
    const current = blocks.media?.photos ?? [];
    const newPhotos: PhotoRef[] = results.map((result, idx) => ({
      mediaId: result.mediaId,
      caption: '',
      sortOrder: current.length + idx,
    }));

    updateMedia('photos', [...current, ...newPhotos]);

    // Update media URLs
    const newUrls = results.reduce(
      (acc, result) => ({ ...acc, [result.mediaId]: result.blobUrl }),
      {} as Record<string, string>,
    );
    setMediaUrls((prev) => ({ ...prev, ...newUrls }));
    setShowPhotoUploader(false);
  };

  const handlePhotoReorder = (reorderedPhotos: PhotoItem[]) => {
    updateMedia(
      'photos',
      reorderedPhotos.map((p) => ({
        mediaId: p.mediaId,
        caption: p.caption ?? '',
        sortOrder: p.sortOrder,
      })),
    );
  };

  const handlePhotoCaptionChange = (mediaId: string, caption: string) => {
    const current = blocks.media?.photos ?? [];
    const updated = current.map((p) =>
      p.mediaId === mediaId ? { ...p, caption } : p,
    );
    updateMedia('photos', updated);
  };

  const removePhoto = (mediaId: string) => {
    const current = blocks.media?.photos ?? [];
    updateMedia(
      'photos',
      current.filter((p) => p.mediaId !== mediaId),
    );
  };

  // Aid station helpers
  const addAidStation = () => {
    const current = blocks.course?.aidStations ?? [];
    updateCourse('aidStations', [
      ...current,
      { name: '', distanceKm: undefined, cutoffTime: '', services: '' },
    ]);
  };

  const removeAidStation = (index: number) => {
    const current = blocks.course?.aidStations ?? [];
    updateCourse(
      'aidStations',
      current.filter((_, i) => i !== index),
    );
  };

  const updateAidStation = (index: number, field: keyof AidStation, value: string | number) => {
    const current = blocks.course?.aidStations ?? [];
    const updated = [...current];
    updated[index] = { ...updated[index], [field]: value };
    updateCourse('aidStations', updated);
  };

  // Start time helpers
  const addStartTime = () => {
    const current = blocks.schedule?.startTimes ?? [];
    updateSchedule('startTimes', [...current, { distanceLabel: '', time: '', notes: '' }]);
  };

  const removeStartTime = (index: number) => {
    const current = blocks.schedule?.startTimes ?? [];
    updateSchedule(
      'startTimes',
      current.filter((_, i) => i !== index),
    );
  };

  const updateStartTime = (index: number, field: keyof StartTime, value: string) => {
    const current = blocks.schedule?.startTimes ?? [];
    const updated = [...current];
    updated[index] = { ...updated[index], [field]: value };
    updateSchedule('startTimes', updated);
  };

  // Sponsor tier helpers
  const addTier = () => {
    const current = blocks.sponsors?.tiers ?? [];
    const newTier: SponsorTier = {
      id: crypto.randomUUID(),
      name: '',
      displaySize: 'md',
      sponsors: [],
      sortOrder: current.length,
    };
    updateSponsors('tiers', [...current, newTier]);
  };

  const removeTier = (tierId: string) => {
    const current = blocks.sponsors?.tiers ?? [];
    updateSponsors(
      'tiers',
      current.filter((tier) => tier.id !== tierId),
    );
  };

  const updateTier = (
    tierId: string,
    field: keyof SponsorTier,
    value: string | SponsorDisplaySize | Sponsor[] | number,
  ) => {
    const current = blocks.sponsors?.tiers ?? [];
    const updated = current.map((tier) =>
      tier.id === tierId ? { ...tier, [field]: value } : tier,
    );
    updateSponsors('tiers', updated);
  };

  // Sponsor helpers within a tier
  const handleSponsorUpload = (tierId: string, logo: UploadedSponsorLogo) => {
    const current = blocks.sponsors?.tiers ?? [];
    const tier = current.find((t) => t.id === tierId);
    if (!tier) return;

    const newSponsor: Sponsor = {
      id: crypto.randomUUID(),
      name: logo.name,
      logoMediaId: logo.mediaId,
      websiteUrl: logo.websiteUrl,
      sortOrder: (tier.sponsors ?? []).length,
    };

    const updatedSponsors = [...(tier.sponsors ?? []), newSponsor];
    updateTier(tierId, 'sponsors', updatedSponsors);
    setMediaUrls((prev) => ({ ...prev, [logo.mediaId]: logo.blobUrl }));
    setShowSponsorUploader(null);
  };

  const removeSponsor = (tierId: string, sponsorId: string) => {
    const current = blocks.sponsors?.tiers ?? [];
    const tier = current.find((t) => t.id === tierId);
    if (!tier) return;

    const updatedSponsors = (tier.sponsors ?? []).filter((s) => s.id !== sponsorId);
    updateTier(tierId, 'sponsors', updatedSponsors);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const inputClassName = "w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30";
  const textareaClassName = cn(inputClassName, "resize-none");

  return (
    <div className="space-y-6">
      {/* Overview Section */}
      <div className={cn(
        "rounded-lg border bg-card shadow-sm transition-all",
        blocks.overview?.enabled && "ring-1 ring-primary/20"
      )}>
        <button
          type="button"
          onClick={() => toggleSection('overview')}
          className="w-full px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-start sm:items-center gap-3">
            <Info className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">{t('sections.overview.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('sections.overview.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {blocks.overview?.enabled ? t('sectionEnabled') : t('sectionDisabled')}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blocks.overview?.enabled ?? true}
                  onChange={(e) => updateOverview('enabled', e.target.checked)}
                  aria-label={(blocks.overview?.enabled ?? true) ? t('disableSection') : t('enableSection')}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>
            {expandedSections.has('overview') ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </button>
        {expandedSections.has('overview') && (
          <div className="px-4 pb-4 sm:px-6 sm:pb-6 space-y-4 border-t">
            <div className="pt-4" />
            <FormField label={t('sections.overview.contentLabel')}>
              <textarea
                placeholder={t('sections.overview.contentPlaceholder')}
                value={blocks.overview?.content ?? ''}
                onChange={(e) => updateOverview('content', e.target.value)}
                rows={6}
                className={textareaClassName}
              />
            </FormField>
            <FormField label={t('sections.overview.terrainLabel')}>
              <textarea
                placeholder={t('sections.overview.terrainPlaceholder')}
                value={blocks.overview?.terrain ?? ''}
                onChange={(e) => updateOverview('terrain', e.target.value)}
                rows={3}
                className={textareaClassName}
              />
            </FormField>
          </div>
        )}
      </div>

      {/* Course Section */}
      <div className={cn(
        "rounded-lg border bg-card shadow-sm transition-all",
        blocks.course?.enabled && "ring-1 ring-primary/20"
      )}>
        <button
          type="button"
          onClick={() => toggleSection('course')}
          className="w-full px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-start sm:items-center gap-3">
            <Map className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">{t('sections.course.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('sections.course.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {blocks.course?.enabled ? t('sectionEnabled') : t('sectionDisabled')}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blocks.course?.enabled ?? false}
                  onChange={(e) => updateCourse('enabled', e.target.checked)}
                  aria-label={(blocks.course?.enabled ?? false) ? t('disableSection') : t('enableSection')}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>
            {expandedSections.has('course') ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </button>
        {expandedSections.has('course') && (
          <div className="px-4 pb-4 sm:px-6 sm:pb-6 space-y-4 border-t">
            <div className="pt-4" />
            <FormField label={t('sections.course.descriptionLabel')}>
              <textarea
                placeholder={t('sections.course.descriptionPlaceholder')}
                value={blocks.course?.description ?? ''}
                onChange={(e) => updateCourse('description', e.target.value)}
                rows={4}
                className={textareaClassName}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('sections.course.elevationLabel')}>
                <input
                  type="text"
                  placeholder={t('sections.course.elevationPlaceholder')}
                  value={blocks.course?.elevationGain ?? ''}
                  onChange={(e) => updateCourse('elevationGain', e.target.value)}
                  className={inputClassName}
                />
              </FormField>
              <FormField label={t('sections.course.mapUrlLabel')}>
                <input
                  type="url"
                  placeholder={t('sections.course.mapUrlPlaceholder')}
                  value={blocks.course?.mapUrl ?? ''}
                  onChange={(e) => updateCourse('mapUrl', e.target.value)}
                  className={inputClassName}
                />
              </FormField>
            </div>
            <FormField label={t('sections.course.elevationProfileLabel')}>
              <input
                type="url"
                placeholder={t('sections.course.elevationProfilePlaceholder')}
                value={blocks.course?.elevationProfileUrl ?? ''}
                onChange={(e) => updateCourse('elevationProfileUrl', e.target.value)}
                className={inputClassName}
              />
            </FormField>

            {/* Aid Stations */}
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium">{t('sections.course.aidStations.title')}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addAidStation}
                  className="w-full min-w-0 sm:w-auto"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('sections.course.aidStations.add')}
                </Button>
              </div>
              {(blocks.course?.aidStations ?? []).map((station, idx) => (
                <div
                  key={idx}
                  className="grid gap-3 p-3 border rounded-lg bg-muted/30 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      {t('sections.course.aidStations.nameLabel')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('sections.course.aidStations.namePlaceholder')}
                      value={station.name}
                      onChange={(e) => updateAidStation(idx, 'name', e.target.value)}
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      {t('sections.course.aidStations.distanceLabel')}
                    </label>
                    <input
                      type="number"
                      placeholder={t('sections.course.aidStations.distancePlaceholder')}
                      value={station.distanceKm ?? ''}
                      onChange={(e) =>
                        updateAidStation(idx, 'distanceKm', parseFloat(e.target.value) || 0)
                      }
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      {t('sections.course.aidStations.cutoffLabel')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('sections.course.aidStations.cutoffPlaceholder')}
                      value={station.cutoffTime ?? ''}
                      onChange={(e) => updateAidStation(idx, 'cutoffTime', e.target.value)}
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      {t('sections.course.aidStations.servicesLabel')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={t('sections.course.aidStations.servicesPlaceholder')}
                        value={station.services ?? ''}
                        onChange={(e) => updateAidStation(idx, 'services', e.target.value)}
                        className={inputClassName}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => removeAidStation(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Schedule Section */}
      <div className={cn(
        "rounded-lg border bg-card shadow-sm transition-all",
        blocks.schedule?.enabled && "ring-1 ring-primary/20"
      )}>
        <button
          type="button"
          onClick={() => toggleSection('schedule')}
          className="w-full px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-start sm:items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">{t('sections.schedule.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('sections.schedule.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {blocks.schedule?.enabled ? t('sectionEnabled') : t('sectionDisabled')}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blocks.schedule?.enabled ?? false}
                  onChange={(e) => updateSchedule('enabled', e.target.checked)}
                  aria-label={(blocks.schedule?.enabled ?? false) ? t('disableSection') : t('enableSection')}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>
            {expandedSections.has('schedule') ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </button>
        {expandedSections.has('schedule') && (
          <div className="px-4 pb-4 sm:px-6 sm:pb-6 space-y-4 border-t">
            <div className="pt-4" />
            <FormField label={t('sections.schedule.packetPickupLabel')}>
              <textarea
                placeholder={t('sections.schedule.packetPickupPlaceholder')}
                value={blocks.schedule?.packetPickup ?? ''}
                onChange={(e) => updateSchedule('packetPickup', e.target.value)}
                rows={3}
                className={textareaClassName}
              />
            </FormField>
            <FormField label={t('sections.schedule.parkingLabel')}>
              <textarea
                placeholder={t('sections.schedule.parkingPlaceholder')}
                value={blocks.schedule?.parking ?? ''}
                onChange={(e) => updateSchedule('parking', e.target.value)}
                rows={3}
                className={textareaClassName}
              />
            </FormField>
            <FormField label={t('sections.schedule.raceDayLabel')}>
              <textarea
                placeholder={t('sections.schedule.raceDayPlaceholder')}
                value={blocks.schedule?.raceDay ?? ''}
                onChange={(e) => updateSchedule('raceDay', e.target.value)}
                rows={3}
                className={textareaClassName}
              />
            </FormField>

            {/* Start Times */}
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium">{t('sections.schedule.startTimes.title')}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addStartTime}
                  className="w-full min-w-0 sm:w-auto"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('sections.schedule.startTimes.add')}
                </Button>
              </div>
              {(blocks.schedule?.startTimes ?? []).map((st, idx) => (
                <div
                  key={idx}
                  className="grid gap-3 p-3 border rounded-lg bg-muted/30 sm:grid-cols-3"
                >
                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      {t('sections.schedule.startTimes.distanceLabel')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('sections.schedule.startTimes.distancePlaceholder')}
                      value={st.distanceLabel}
                      onChange={(e) => updateStartTime(idx, 'distanceLabel', e.target.value)}
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      {t('sections.schedule.startTimes.timeLabel')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('sections.schedule.startTimes.timePlaceholder')}
                      value={st.time}
                      onChange={(e) => updateStartTime(idx, 'time', e.target.value)}
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      {t('sections.schedule.startTimes.notesLabel')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={t('sections.schedule.startTimes.notesPlaceholder')}
                        value={st.notes ?? ''}
                        onChange={(e) => updateStartTime(idx, 'notes', e.target.value)}
                        className={inputClassName}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => removeStartTime(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Media Section */}
      <div className={cn(
        "rounded-lg border bg-card shadow-sm transition-all",
        blocks.media?.enabled && "ring-1 ring-primary/20"
      )}>
        <button
          type="button"
          onClick={() => toggleSection('media')}
          className="w-full px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-start sm:items-center gap-3">
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">{t('sections.media.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('sections.media.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {blocks.media?.enabled ? t('sectionEnabled') : t('sectionDisabled')}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blocks.media?.enabled ?? false}
                  onChange={(e) => updateMedia('enabled', e.target.checked)}
                  aria-label={(blocks.media?.enabled ?? false) ? t('disableSection') : t('enableSection')}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>
            {expandedSections.has('media') ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </button>
        {expandedSections.has('media') && (
          <div className="px-4 pb-4 sm:px-6 sm:pb-6 space-y-6 border-t">
            <div className="pt-4" />

            {/* Documents Section */}
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{t('sections.media.documents.title')}</span>
                  <p className="text-xs text-muted-foreground">
                    {t('sections.media.documents.description')}
                  </p>
                </div>
                {!showDocumentUploader && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDocumentUploader(true)}
                    className="w-full min-w-0 sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t('sections.media.documents.add')}
                  </Button>
                )}
              </div>

              {/* Document Uploader */}
              {showDocumentUploader && (
                <DocumentUploader
                  organizationId={organizationId}
                  onUploadComplete={handleDocumentUpload}
                  onCancel={() => setShowDocumentUploader(false)}
                  labels={{
                    title: t('sections.media.documents.uploaderTitle'),
                    labelField: t('sections.media.documents.labelField'),
                    labelPlaceholder: t('sections.media.documents.labelPlaceholder'),
                    upload: t('sections.media.documents.upload'),
                    uploading: t('sections.media.documents.uploading'),
                    cancel: t('sections.media.documents.cancel'),
                    selectFile: t('sections.media.documents.selectFile'),
                    fileTooLarge: t('sections.media.documents.fileTooLarge', { maxSize: Math.round(EVENT_MEDIA_MAX_FILE_SIZE / (1024 * 1024)) }),
                    invalidType: t('sections.media.documents.invalidType'),
                    uploadFailed: t('sections.media.documents.uploadFailed'),
                    maxSize: t('sections.media.documents.maxSize', { maxSize: Math.round(EVENT_MEDIA_MAX_FILE_SIZE / (1024 * 1024)) }),
                  }}
                />
              )}

              {/* Existing Documents List */}
              {(blocks.media?.documents ?? []).length > 0 ? (
                <div className="space-y-2">
                  {(blocks.media?.documents ?? []).map((doc, idx) => (
                    <div
                      key={doc.mediaId}
                      className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30"
                    >
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 text-sm font-medium truncate">{doc.label}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0 text-destructive hover:text-destructive"
                        onClick={() => removeDocument(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : !showDocumentUploader ? (
                <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('sections.media.documents.empty')}</p>
                </div>
              ) : null}
            </div>

            {/* Photos Section - Placeholder for now */}
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{t('sections.media.photos.title')}</span>
                  <p className="text-xs text-muted-foreground">
                    {t('sections.media.photos.description')}
                  </p>
                </div>
                {!showPhotoUploader && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPhotoUploader(true)}
                    className="w-full min-w-0 sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t('sections.media.photos.add')}
                  </Button>
                )}
              </div>

              {showPhotoUploader && (
                <BulkPhotoUploader
                  organizationId={organizationId}
                  existingPhotosCount={(blocks.media?.photos ?? []).length}
                  onUploadComplete={handleBulkPhotoUpload}
                  onCancel={() => setShowPhotoUploader(false)}
                  labels={{
                    title: t('sections.media.photos.uploaderTitle'),
                    dropzoneText: t('sections.media.photos.dropzoneText'),
                    dropzoneHint: t('sections.media.photos.dropzoneHint'),
                    uploading: t('sections.media.photos.uploading'),
                    upload: t('sections.media.photos.upload'),
                    cancel: t('sections.media.photos.cancel'),
                    retry: t('sections.media.photos.retry'),
                    retryAll: t('sections.media.photos.retryAll'),
                    cancelAll: t('sections.media.photos.cancelAll'),
                    removeFile: t('sections.media.photos.removeFile'),
                    pending: t('sections.media.photos.pending'),
                    success: t('sections.media.photos.success'),
                    error: t('sections.media.photos.error'),
                    fileTooLarge: t('sections.media.photos.fileTooLarge', {
                      maxSize: Math.round(EVENT_MEDIA_MAX_FILE_SIZE / (1024 * 1024)),
                    }),
                    invalidType: t('sections.media.photos.invalidType'),
                    maxPhotosReached: t('sections.media.photos.maxPhotosReached'),
                    filesSelected: t('sections.media.photos.filesSelected'),
                    completed: t('sections.media.photos.completed'),
                    failed: t('sections.media.photos.failed'),
                  }}
                />
              )}

              {!showPhotoUploader && (
                <SortablePhotoGrid
                  photos={(blocks.media?.photos ?? []).map((p) => ({
                    mediaId: p.mediaId,
                    caption: p.caption,
                    sortOrder: p.sortOrder,
                  }))}
                  mediaUrls={mediaUrls}
                  onReorder={handlePhotoReorder}
                  onCaptionChange={handlePhotoCaptionChange}
                  onDelete={removePhoto}
                  labels={{
                    captionLabel: t('sections.media.photos.captionLabel'),
                    captionPlaceholder: t('sections.media.photos.captionPlaceholder'),
                    deletePhoto: t('sections.media.photos.deletePhoto'),
                    dragToReorder: t('sections.media.photos.dragToReorder'),
                    emptyState: t('sections.media.photos.empty'),
                  }}
                  inputClassName={inputClassName}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sponsors Section */}
      <div className={cn(
        "rounded-lg border bg-card shadow-sm transition-all",
        blocks.sponsors?.enabled && "ring-1 ring-primary/20"
      )}>
        <button
          type="button"
          onClick={() => toggleSection('sponsors')}
          className="w-full px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-start sm:items-center gap-3">
            <Award className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">{t('sections.sponsors.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('sections.sponsors.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {blocks.sponsors?.enabled ? t('sectionEnabled') : t('sectionDisabled')}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blocks.sponsors?.enabled ?? false}
                  onChange={(e) => updateSponsors('enabled', e.target.checked)}
                  aria-label={(blocks.sponsors?.enabled ?? false) ? t('disableSection') : t('enableSection')}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>
            {expandedSections.has('sponsors') ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </button>
        {expandedSections.has('sponsors') && (
          <div className="px-4 pb-4 sm:px-6 sm:pb-6 space-y-6 border-t">
            <div className="pt-4" />

            {/* Section Title and Subtitle */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('sections.sponsors.titleLabel')}>
                <input
                  type="text"
                  placeholder={t('sections.sponsors.titlePlaceholder')}
                  value={blocks.sponsors?.title ?? ''}
                  onChange={(e) => updateSponsors('title', e.target.value)}
                  className={inputClassName}
                  maxLength={255}
                />
              </FormField>
              <FormField label={t('sections.sponsors.subtitleLabel')}>
                <input
                  type="text"
                  placeholder={t('sections.sponsors.subtitlePlaceholder')}
                  value={blocks.sponsors?.subtitle ?? ''}
                  onChange={(e) => updateSponsors('subtitle', e.target.value)}
                  className={inputClassName}
                  maxLength={500}
                />
              </FormField>
            </div>

            {/* Tiers */}
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{t('sections.sponsors.tiers.title')}</span>
                  <p className="text-xs text-muted-foreground">
                    {t('sections.sponsors.tiers.description')}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTier}
                  className="w-full min-w-0 sm:w-auto"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('sections.sponsors.tiers.add')}
                </Button>
              </div>

              {(blocks.sponsors?.tiers ?? []).length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Award className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('sections.sponsors.tiers.empty')}</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {(blocks.sponsors?.tiers ?? [])
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((tier) => (
                      <div
                        key={tier.id}
                        className="rounded-lg border bg-muted/30 overflow-hidden"
                      >
                        {/* Tier Header */}
                        <div className="p-4 bg-muted/50 border-b">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1">
                              <label className="text-xs font-medium">
                                {t('sections.sponsors.tiers.nameLabel')}
                              </label>
                              <input
                                type="text"
                                placeholder={t('sections.sponsors.tiers.namePlaceholder')}
                                value={tier.name}
                                onChange={(e) => updateTier(tier.id, 'name', e.target.value)}
                                className={inputClassName}
                                maxLength={50}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium">
                                {t('sections.sponsors.tiers.sizeLabel')}
                              </label>
                              <select
                                value={tier.displaySize}
                                onChange={(e) =>
                                  updateTier(tier.id, 'displaySize', e.target.value as SponsorDisplaySize)
                                }
                                className={inputClassName}
                              >
                                {SPONSOR_DISPLAY_SIZES.map((size) => (
                                  <option key={size} value={size}>
                                    {t(`sections.sponsors.tiers.sizes.${size}`)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-end justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => removeTier(tier.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Sponsors in Tier */}
                        <div className="p-4 space-y-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-sm font-medium">
                              {t('sections.sponsors.sponsors.title')}
                            </span>
                            {showSponsorUploader !== tier.id && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowSponsorUploader(tier.id)}
                                className="w-full min-w-0 sm:w-auto"
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                {t('sections.sponsors.sponsors.add')}
                              </Button>
                            )}
                          </div>

                          {/* Sponsor Uploader */}
                          {showSponsorUploader === tier.id && (
                            <SponsorLogoUploader
                              organizationId={organizationId}
                              onUploadComplete={(logo) => handleSponsorUpload(tier.id, logo)}
                              onCancel={() => setShowSponsorUploader(null)}
                              labels={{
                                title: t('sections.sponsors.sponsors.uploaderTitle'),
                                nameLabel: t('sections.sponsors.sponsors.nameLabel'),
                                namePlaceholder: t('sections.sponsors.sponsors.namePlaceholder'),
                                websiteLabel: t('sections.sponsors.sponsors.websiteLabel'),
                                websitePlaceholder: t('sections.sponsors.sponsors.websitePlaceholder'),
                                upload: t('sections.sponsors.sponsors.upload'),
                                uploading: t('sections.sponsors.sponsors.uploading'),
                                cancel: t('sections.sponsors.sponsors.cancel'),
                                selectFile: t('sections.sponsors.sponsors.selectFile'),
                                fileTooLarge: t('sections.sponsors.sponsors.fileTooLarge', {
                                  maxSize: Math.round(EVENT_MEDIA_MAX_FILE_SIZE / (1024 * 1024)),
                                }),
                                invalidType: t('sections.sponsors.sponsors.invalidType'),
                                uploadFailed: t('sections.sponsors.sponsors.uploadFailed'),
                                maxSize: t('sections.sponsors.sponsors.maxSize', {
                                  maxSize: Math.round(EVENT_MEDIA_MAX_FILE_SIZE / (1024 * 1024)),
                                }),
                              }}
                            />
                          )}

                          {/* Sponsors List */}
                          {(tier.sponsors ?? []).length === 0 && showSponsorUploader !== tier.id ? (
                            <div className="text-center py-4 text-muted-foreground border-2 border-dashed rounded-lg">
                              <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">{t('sections.sponsors.sponsors.empty')}</p>
                            </div>
                          ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {(tier.sponsors ?? [])
                                .slice()
                                .sort((a, b) => a.sortOrder - b.sortOrder)
                                .map((sponsor) => {
                                  const logoUrl = mediaUrls[sponsor.logoMediaId];

                                  return (
                                    <div
                                      key={sponsor.id}
                                      className="rounded-lg border bg-card overflow-hidden"
                                    >
                                      <div className="relative h-20 bg-white flex items-center justify-center p-2">
                                        {logoUrl ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={logoUrl}
                                            alt={sponsor.name}
                                            className="h-full w-full object-contain"
                                          />
                                        ) : (
                                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                                        )}
                                      </div>
                                      <div className="p-3 space-y-2 border-t">
                                        <p className="text-sm font-medium truncate">{sponsor.name}</p>
                                        {sponsor.websiteUrl && (
                                          <p className="text-xs text-muted-foreground truncate">
                                            {sponsor.websiteUrl}
                                          </p>
                                        )}
                                        <div className="flex justify-end">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive hover:text-destructive h-7 w-7"
                                            onClick={() => removeSponsor(tier.id, sponsor.id)}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('saving')}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {t('save')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
