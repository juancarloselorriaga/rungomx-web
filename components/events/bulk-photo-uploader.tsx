'use client';

import { useState, useCallback, useRef } from 'react';
import { AlertCircle, Check, Loader2, RefreshCw, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EVENT_MEDIA_MAX_FILE_SIZE } from '@/lib/events/media/constants';

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_CONCURRENT_UPLOADS = 3;
const MAX_PHOTOS = 50;

export interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  result?: { mediaId: string; blobUrl: string };
  previewUrl?: string;
}

export interface BulkPhotoUploaderProps {
  organizationId: string;
  existingPhotosCount?: number;
  onUploadComplete: (results: Array<{ mediaId: string; blobUrl: string }>) => void;
  onCancel: () => void;
  labels: {
    title: string;
    dropzoneText: string;
    dropzoneHint: string;
    uploading: string;
    upload: string;
    cancel: string;
    retry: string;
    retryAll: string;
    cancelAll: string;
    removeFile: string;
    pending: string;
    success: string;
    error: string;
    fileTooLarge: string;
    invalidType: string;
    maxPhotosReached: string;
    filesSelected: string;
    completed: string;
    failed: string;
  };
}

export function BulkPhotoUploader({
  organizationId,
  existingPhotosCount = 0,
  onUploadComplete,
  onCancel,
  labels,
}: BulkPhotoUploaderProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const remainingSlots = MAX_PHOTOS - existingPhotosCount;

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        return labels.invalidType;
      }
      if (file.size > EVENT_MEDIA_MAX_FILE_SIZE) {
        return labels.fileTooLarge;
      }
      return null;
    },
    [labels.fileTooLarge, labels.invalidType],
  );

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles);
      const availableSlots = remainingSlots - files.length;

      if (availableSlots <= 0) {
        return;
      }

      const filesToAdd = fileArray.slice(0, availableSlots);

      const uploadFiles: UploadFile[] = filesToAdd.map((file) => {
        const error = validateFile(file);
        return {
          id: crypto.randomUUID(),
          file,
          status: error ? 'error' : 'pending',
          progress: 0,
          error: error ?? undefined,
          previewUrl: error ? undefined : URL.createObjectURL(file),
        };
      });

      setFiles((prev) => [...prev, ...uploadFiles]);
    },
    [files.length, remainingSlots, validateFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
      }
    },
    [addFiles],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (selectedFiles && selectedFiles.length > 0) {
        addFiles(selectedFiles);
      }
      // Reset input to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [addFiles],
  );

  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === fileId);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      // Cancel ongoing upload if any
      const controller = abortControllersRef.current.get(fileId);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(fileId);
      }
      return prev.filter((f) => f.id !== fileId);
    });
  }, []);

  const uploadFile = useCallback(
    async (uploadFile: UploadFile): Promise<{ mediaId: string; blobUrl: string } | null> => {
      const abortController = new AbortController();
      abortControllersRef.current.set(uploadFile.id, abortController);

      try {
        setFiles((prev) =>
          prev.map((f) => (f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 0 } : f)),
        );

        // Build the pathname for the upload
        const timestamp = Date.now();
        const safeFilename = uploadFile.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const pathname = `event-media/${organizationId}/${timestamp}-${safeFilename}`;

        // Use XMLHttpRequest for progress tracking
        const result = await new Promise<{ mediaId: string; blobUrl: string }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const progress = Math.round((e.loaded / e.total) * 90); // 90% for upload, 10% for confirmation
              setFiles((prev) =>
                prev.map((f) => (f.id === uploadFile.id ? { ...f, progress } : f)),
              );
            }
          });

          xhr.addEventListener('load', async () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText);
                setFiles((prev) =>
                  prev.map((f) => (f.id === uploadFile.id ? { ...f, progress: 95 } : f)),
                );

                // Confirm upload via server action
                const { confirmEventMediaUpload } = await import('@/lib/events/actions');
                const confirmResult = await confirmEventMediaUpload({
                  organizationId,
                  blobUrl: response.url,
                  kind: 'image',
                });

                if (!confirmResult.ok) {
                  reject(new Error(confirmResult.error || 'Upload confirmation failed'));
                  return;
                }

                resolve({
                  mediaId: confirmResult.data.mediaId,
                  blobUrl: confirmResult.data.blobUrl,
                });
              } catch (err) {
                reject(err);
              }
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          });

          xhr.addEventListener('error', () => reject(new Error('Network error')));
          xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

          // Create form data for direct upload
          const formData = new FormData();
          formData.append('file', uploadFile.file);

          // Open connection to our upload handler
          xhr.open('POST', `/api/events/media/upload?pathname=${encodeURIComponent(pathname)}&organizationId=${encodeURIComponent(organizationId)}`);
          xhr.send(formData);

          // Handle abort
          abortController.signal.addEventListener('abort', () => xhr.abort());
        });

        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id
              ? { ...f, status: 'success', progress: 100, result, error: undefined }
              : f,
          ),
        );

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id ? { ...f, status: 'error', error: errorMessage, progress: 0 } : f,
          ),
        );
        return null;
      } finally {
        abortControllersRef.current.delete(uploadFile.id);
      }
    },
    [organizationId],
  );

  const startUpload = useCallback(async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending' || f.status === 'error');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    // Upload in batches of MAX_CONCURRENT_UPLOADS
    const results: Array<{ mediaId: string; blobUrl: string }> = [];
    const queue = [...pendingFiles];

    const processQueue = async () => {
      const batch = queue.splice(0, MAX_CONCURRENT_UPLOADS);
      if (batch.length === 0) return;

      const batchResults = await Promise.all(batch.map(uploadFile));
      results.push(...batchResults.filter((r): r is { mediaId: string; blobUrl: string } => r !== null));

      if (queue.length > 0) {
        await processQueue();
      }
    };

    await processQueue();

    setIsUploading(false);

    // If all uploads completed successfully, call onUploadComplete
    const allSuccess = files.every((f) => f.status === 'success' || f.status === 'error');
    if (allSuccess && results.length > 0) {
      onUploadComplete(results);
    }
  }, [files, uploadFile, onUploadComplete]);

  const retryFailed = useCallback(() => {
    setFiles((prev) =>
      prev.map((f) => (f.status === 'error' ? { ...f, status: 'pending', error: undefined } : f)),
    );
  }, []);

  const cancelAllUploads = useCallback(() => {
    // Abort all ongoing uploads
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();

    // Clean up preview URLs
    files.forEach((f) => {
      if (f.previewUrl) {
        URL.revokeObjectURL(f.previewUrl);
      }
    });

    onCancel();
  }, [files, onCancel]);

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const uploadingCount = files.filter((f) => f.status === 'uploading').length;
  const successCount = files.filter((f) => f.status === 'success').length;
  const errorCount = files.filter((f) => f.status === 'error').length;

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{labels.title}</h4>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={cancelAllUploads}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Dropzone */}
      {remainingSlots > 0 && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            onChange={handleFileSelect}
            className="sr-only"
          />
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">{labels.dropzoneText}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {labels.dropzoneHint} ({remainingSlots} {remainingSlots === 1 ? 'slot' : 'slots'} remaining)
          </p>
        </div>
      )}

      {remainingSlots <= 0 && files.length === 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
          <AlertCircle className="h-5 w-5 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive">{labels.maxPhotosReached}</p>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{labels.filesSelected.replace('{count}', String(files.length))}</span>
            {successCount > 0 && (
              <span className="text-green-600">
                {labels.completed}: {successCount}
              </span>
            )}
            {errorCount > 0 && (
              <span className="text-destructive">
                {labels.failed}: {errorCount}
              </span>
            )}
          </div>

          {/* File grid */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-[300px] overflow-y-auto">
            {files.map((file) => (
              <div
                key={file.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-2 bg-background',
                  file.status === 'error' && 'border-destructive/50',
                  file.status === 'success' && 'border-green-500/50',
                )}
              >
                {/* Preview */}
                <div className="relative h-12 w-12 flex-shrink-0 rounded overflow-hidden bg-muted">
                  {file.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={file.previewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}

                  {/* Status overlay */}
                  {file.status === 'uploading' && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  )}
                  {file.status === 'success' && (
                    <div className="absolute inset-0 bg-green-500/50 flex items-center justify-center">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{file.file.name}</p>
                  <div className="mt-1">
                    {file.status === 'uploading' && (
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    )}
                    {file.status === 'error' && (
                      <p className="text-xs text-destructive truncate">{file.error}</p>
                    )}
                    {file.status === 'pending' && (
                      <p className="text-xs text-muted-foreground">{labels.pending}</p>
                    )}
                    {file.status === 'success' && (
                      <p className="text-xs text-green-600">{labels.success}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex-shrink-0">
                  {file.status === 'error' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() =>
                        setFiles((prev) =>
                          prev.map((f) =>
                            f.id === file.id ? { ...f, status: 'pending', error: undefined } : f,
                          ),
                        )
                      }
                      title={labels.retry}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  )}
                  {(file.status === 'pending' || file.status === 'error') && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFile(file.id)}
                      title={labels.removeFile}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {errorCount > 0 && !isUploading && (
            <Button type="button" variant="outline" size="sm" onClick={retryFailed}>
              <RefreshCw className="h-4 w-4 mr-1" />
              {labels.retryAll}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={cancelAllUploads}>
            {labels.cancel}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pendingCount === 0 || isUploading}
            onClick={startUpload}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                {labels.uploading} ({uploadingCount}/{pendingCount + uploadingCount + successCount})
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1" />
                {labels.upload} ({pendingCount})
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
