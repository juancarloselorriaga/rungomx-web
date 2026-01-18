'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { uploadEventMediaFile } from '@/components/events/event-media-upload';
import { EVENT_MEDIA_IMAGE_TYPES, EVENT_MEDIA_MAX_FILE_SIZE } from '@/lib/events/media/constants';

export interface UploadedPhoto {
  mediaId: string;
  blobUrl: string;
}

interface PhotoUploaderProps {
  organizationId: string;
  onUploadComplete: (photo: UploadedPhoto) => void;
  onCancel: () => void;
  labels: {
    title: string;
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

export function PhotoUploader({
  organizationId,
  onUploadComplete,
  onCancel,
  labels,
  acceptedTypes = [...EVENT_MEDIA_IMAGE_TYPES],
  maxFileSizeMb,
}: PhotoUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const result = await uploadEventMediaFile({
        organizationId,
        file: selectedFile,
        kind: 'image',
        purpose: 'photo',
      });

      onUploadComplete({
        mediaId: result.mediaId,
        blobUrl: result.blobUrl,
      });
    } catch (err) {
      console.error('[photo-uploader] Upload failed:', err);
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

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <h4 className="font-medium">{labels.title}</h4>

      {!selectedFile ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer hover:border-primary/50 transition-colors"
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
          <div className="h-16 w-16 overflow-hidden rounded-md border bg-background flex-shrink-0">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
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
        <Button type="button" onClick={handleUpload} disabled={isUploading || !selectedFile}>
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
