'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { uploadEventMediaFile } from '@/components/events/event-media-upload';
import { EVENT_MEDIA_IMAGE_TYPES, EVENT_MEDIA_MAX_FILE_SIZE } from '@/lib/events/media/constants';
import { cn } from '@/lib/utils';

export interface UploadedSponsorLogo {
  mediaId: string;
  blobUrl: string;
  name: string;
  websiteUrl?: string;
}

interface SponsorLogoUploaderProps {
  organizationId: string;
  onUploadComplete: (logo: UploadedSponsorLogo) => void;
  onCancel: () => void;
  labels: {
    title: string;
    nameLabel: string;
    namePlaceholder: string;
    websiteLabel: string;
    websitePlaceholder: string;
    upload: string;
    uploading: string;
    cancel: string;
    selectFile: string;
    fileTooLarge: string;
    invalidType: string;
    uploadFailed: string;
    maxSize: string;
  };
  acceptedTypes?: string[];
  maxFileSizeMb?: number;
}

const inputClassName =
  'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30';

export function SponsorLogoUploader({
  organizationId,
  onUploadComplete,
  onCancel,
  labels,
  acceptedTypes = [...EVENT_MEDIA_IMAGE_TYPES],
  maxFileSizeMb,
}: SponsorLogoUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxFileSize = maxFileSizeMb
    ? maxFileSizeMb * 1024 * 1024
    : EVENT_MEDIA_MAX_FILE_SIZE;
  const maxFileSizeDisplay =
    maxFileSizeMb ?? Math.round(EVENT_MEDIA_MAX_FILE_SIZE / (1024 * 1024));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!acceptedTypes.includes(file.type)) {
      setError(labels.invalidType);
      return;
    }

    if (file.size > maxFileSize) {
      setError(labels.fileTooLarge.replace('{maxSize}', String(maxFileSizeDisplay)));
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !name.trim()) return;

    setIsUploading(true);
    setError(null);

    try {
      const result = await uploadEventMediaFile({
        organizationId,
        file: selectedFile,
        kind: 'image',
        purpose: 'sponsor-logo',
      });

      onUploadComplete({
        mediaId: result.mediaId,
        blobUrl: result.blobUrl,
        name: name.trim(),
        websiteUrl: websiteUrl.trim() || undefined,
      });
    } catch (err) {
      console.error('[sponsor-logo-uploader] Upload failed:', err);
      setError(labels.uploadFailed);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const previewUrl = useMemo(() => {
    if (!selectedFile) return null;
    return URL.createObjectURL(selectedFile);
  }, [selectedFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const canUpload = selectedFile && name.trim().length > 0;

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <h4 className="font-medium">{labels.title}</h4>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={labels.nameLabel} required>
          <input
            type="text"
            placeholder={labels.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClassName}
            maxLength={100}
            disabled={isUploading}
          />
        </FormField>
        <FormField label={labels.websiteLabel}>
          <input
            type="url"
            placeholder={labels.websitePlaceholder}
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            className={inputClassName}
            disabled={isUploading}
          />
        </FormField>
      </div>

      {!selectedFile ? (
        <div
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer hover:border-primary/50 transition-colors',
            isUploading && 'pointer-events-none opacity-50',
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{labels.selectFile}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {labels.maxSize.replace('{maxSize}', String(maxFileSizeDisplay))}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedTypes.join(',')}
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="h-16 w-16 overflow-hidden rounded-md border bg-white flex-shrink-0">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRemoveFile}
            disabled={isUploading}
            className="flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isUploading}>
          {labels.cancel}
        </Button>
        <Button type="button" onClick={handleUpload} disabled={isUploading || !canUpload}>
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {labels.uploading}
            </>
          ) : (
            labels.upload
          )}
        </Button>
      </div>
    </div>
  );
}
