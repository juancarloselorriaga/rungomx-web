'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
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
import { cn } from '@/lib/utils';
import { EVENT_MEDIA_MAX_FILE_SIZE } from '@/lib/events/media/constants';

import { getWebsiteContent, updateWebsiteContent } from '@/lib/events/website/actions';
import {
  DEFAULT_WEBSITE_BLOCKS,
  type WebsiteContentBlocks,
  type CourseSection,
  type ScheduleSection,
  type MediaSection,
} from '@/lib/events/website/types';

type AidStation = NonNullable<CourseSection['aidStations']>[number];
type StartTime = NonNullable<ScheduleSection['startTimes']>[number];
type DocumentRef = NonNullable<MediaSection['documents']>[number];

interface WebsiteContentEditorProps {
  editionId: string;
  locale: string;
  organizationId: string;
}

export function WebsiteContentEditor({ editionId, locale, organizationId }: WebsiteContentEditorProps) {
  const t = useTranslations('pages.dashboard.events.website');
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [blocks, setBlocks] = useState<WebsiteContentBlocks>(DEFAULT_WEBSITE_BLOCKS);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));
  const [showDocumentUploader, setShowDocumentUploader] = useState(false);

  // Load existing content on mount
  useEffect(() => {
    async function loadContent() {
      const result = await getWebsiteContent({ editionId, locale });
      if (result.ok && result.data) {
        setBlocks(result.data.blocks);
        // Expand sections that have content
        const sectionsWithContent = new Set<string>();
        if (result.data.blocks.overview?.enabled) sectionsWithContent.add('overview');
        if (result.data.blocks.course?.enabled) sectionsWithContent.add('course');
        if (result.data.blocks.schedule?.enabled) sectionsWithContent.add('schedule');
        if (result.data.blocks.media?.enabled) sectionsWithContent.add('media');
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
    value: boolean | DocumentRef[] | undefined,
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
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">{t('sections.overview.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('sections.overview.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="text-xs text-muted-foreground">
                {blocks.overview?.enabled ? t('sectionEnabled') : t('sectionDisabled')}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blocks.overview?.enabled ?? true}
                  onChange={(e) => updateOverview('enabled', e.target.checked)}
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
          <div className="px-6 pb-6 space-y-4 border-t">
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
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Map className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">{t('sections.course.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('sections.course.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="text-xs text-muted-foreground">
                {blocks.course?.enabled ? t('sectionEnabled') : t('sectionDisabled')}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blocks.course?.enabled ?? false}
                  onChange={(e) => updateCourse('enabled', e.target.checked)}
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
          <div className="px-6 pb-6 space-y-4 border-t">
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
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('sections.course.aidStations.title')}</span>
                <Button type="button" variant="outline" size="sm" onClick={addAidStation}>
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
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">{t('sections.schedule.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('sections.schedule.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="text-xs text-muted-foreground">
                {blocks.schedule?.enabled ? t('sectionEnabled') : t('sectionDisabled')}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blocks.schedule?.enabled ?? false}
                  onChange={(e) => updateSchedule('enabled', e.target.checked)}
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
          <div className="px-6 pb-6 space-y-4 border-t">
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
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('sections.schedule.startTimes.title')}</span>
                <Button type="button" variant="outline" size="sm" onClick={addStartTime}>
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
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">{t('sections.media.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('sections.media.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="text-xs text-muted-foreground">
                {blocks.media?.enabled ? t('sectionEnabled') : t('sectionDisabled')}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blocks.media?.enabled ?? false}
                  onChange={(e) => updateMedia('enabled', e.target.checked)}
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
          <div className="px-6 pb-6 space-y-6 border-t">
            <div className="pt-4" />

            {/* Documents Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
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
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{t('sections.media.photos.title')}</span>
                  <p className="text-xs text-muted-foreground">
                    {t('sections.media.photos.description')}
                  </p>
                </div>
              </div>
              <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('sections.media.photos.comingSoon')}</p>
              </div>
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
