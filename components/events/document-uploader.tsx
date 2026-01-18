'use client';

import { useState, useRef } from 'react';
import { upload } from '@vercel/blob/client';
import { FileText, Loader2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { confirmEventMediaUpload } from '@/lib/events/actions';
import { EVENT_MEDIA_BLOB_PREFIX, EVENT_MEDIA_MAX_FILE_SIZE } from '@/lib/events/media/constants';

export interface UploadedDocument {
  mediaId: string;
  blobUrl: string;
  label: string;
}

interface DocumentUploaderProps {
  organizationId: string;
  onUploadComplete: (document: UploadedDocument) => void;
  onCancel: () => void;
  labels: {
    title: string;
    labelField: string;
    labelPlaceholder: string;
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

const DEFAULT_PDF_TYPES = ['application/pdf'];

export function DocumentUploader({
  organizationId,
  onUploadComplete,
  onCancel,
  labels,
  acceptedTypes = DEFAULT_PDF_TYPES,
  maxFileSizeMb,
}: DocumentUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxFileSize = maxFileSizeMb
    ? maxFileSizeMb * 1024 * 1024
    : EVENT_MEDIA_MAX_FILE_SIZE;
  const maxFileSizeDisplay = maxFileSizeMb ?? Math.round(EVENT_MEDIA_MAX_FILE_SIZE / (1024 * 1024));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!acceptedTypes.includes(file.type)) {
      setError(labels.invalidType);
      return;
    }

    // Validate file size
    if (file.size > maxFileSize) {
      setError(labels.fileTooLarge.replace('{maxSize}', String(maxFileSizeDisplay)));
      return;
    }

    setSelectedFile(file);
    // Auto-fill label from filename (without extension)
    if (!label) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setLabel(nameWithoutExt);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !label.trim()) return;

    setIsUploading(true);
    setError(null);

    try {
      // Generate unique filename
      const timestamp = Date.now();
      const safeFilename = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const pathname = `${EVENT_MEDIA_BLOB_PREFIX}/${organizationId}/${timestamp}-${safeFilename}`;

      // Upload to Vercel Blob
      const blob = await upload(pathname, selectedFile, {
        access: 'public',
        handleUploadUrl: '/api/events/media',
        clientPayload: JSON.stringify({
          organizationId,
          purpose: 'document',
        }),
      });

      // Confirm the upload and get media ID
      const confirmResult = await confirmEventMediaUpload({
        organizationId,
        blobUrl: blob.url,
        kind: 'pdf',
      });

      if (!confirmResult.ok) {
        throw new Error(confirmResult.error || labels.uploadFailed);
      }

      onUploadComplete({
        mediaId: confirmResult.data.mediaId,
        blobUrl: confirmResult.data.blobUrl,
        label: label.trim(),
      });
    } catch (err) {
      console.error('[document-uploader] Upload failed:', err);
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

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <h4 className="font-medium">{labels.title}</h4>

      {/* Label input */}
      <div className="space-y-2">
        <label htmlFor="doc-label" className="text-sm font-medium">
          {labels.labelField}
        </label>
        <input
          id="doc-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={labels.labelPlaceholder}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          disabled={isUploading}
        />
      </div>

      {/* File selection */}
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
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" />
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

      {/* Error message */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isUploading}
        >
          {labels.cancel}
        </Button>
        <Button
          type="button"
          onClick={handleUpload}
          disabled={isUploading || !selectedFile || !label.trim()}
        >
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
