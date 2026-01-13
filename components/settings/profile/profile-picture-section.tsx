'use client';

import {
  confirmProfilePictureUpload,
  deleteProfilePictureAction,
} from '@/app/actions/profile-picture';
import UserAvatar from '@/components/auth/user-avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { User } from '@/lib/auth/types';
import { ALLOWED_IMAGE_TYPES, BLOB_STORE_PREFIX, MAX_FILE_SIZE_MB } from '@/lib/profile-picture';
import { optimizeImage, validateImageFile } from '@/lib/profile-picture';
import { upload } from '@vercel/blob/client';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

type ProfilePictureSectionProps = {
  user: User | null;
  isInternal: boolean;
  isBusy?: boolean;
  onUpdateAction?: () => void;
};

export function ProfilePictureSection({
  user,
  isInternal,
  isBusy = false,
  onUpdateAction,
}: ProfilePictureSectionProps) {
  const t = useTranslations('components.settings.profilePicture');
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file
      const validation = validateImageFile(file);
      if (!validation.valid) {
        toast.error(validation.error);
        return;
      }

      setIsUploading(true);

      try {
        // Show preview
        const previewObjectUrl = URL.createObjectURL(file);
        setPreviewUrl(previewObjectUrl);

        // Optimize image on client side
        const optimizedBlob = await optimizeImage(file);
        const optimizedFile = new File([optimizedBlob], 'profile-picture.webp', {
          type: 'image/webp',
        });

        // Upload to Vercel Blob (allowOverwrite for replacing existing picture)
        const blob = await upload(`${BLOB_STORE_PREFIX}/${user?.id}/profile.webp`, optimizedFile, {
          access: 'public',
          handleUploadUrl: '/api/profile-picture',
          clientPayload: JSON.stringify({ allowOverwrite: true }),
        });

        // Confirm the upload and update session
        const result = await confirmProfilePictureUpload(blob.url);

        if (!result.ok) {
          throw new Error(
            result.error === 'INVALID_INPUT' ? t('errors.invalidImage') : t('errors.uploadFailed'),
          );
        }

        toast.success(t('success.uploaded'));
        onUpdateAction?.();
        router.refresh();
      } catch (error) {
        console.error('[profile-picture] Upload error:', error);
        toast.error(error instanceof Error ? error.message : t('errors.uploadFailed'));
        setPreviewUrl(null);
      } finally {
        setIsUploading(false);
        // Reset input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [user?.id, t, onUpdateAction, router],
  );

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);

    try {
      const result = await deleteProfilePictureAction();

      if (!result.ok) {
        throw new Error(t('errors.deleteFailed'));
      }

      toast.success(t('success.deleted'));
      setPreviewUrl(null);
      onUpdateAction?.();
      router.refresh();
    } catch (error) {
      console.error('[profile-picture] Delete error:', error);
      toast.error(error instanceof Error ? error.message : t('errors.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  }, [t, onUpdateAction, router]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Don't render for internal users - placed after all hooks
  if (isInternal) {
    return null;
  }

  const isDisabled = isBusy || isUploading || isDeleting;
  const hasImage = !!user?.image || !!previewUrl;

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* Avatar Preview */}
        <div className="relative">
          {previewUrl ? (
            <div className="relative h-24 w-24 overflow-hidden rounded-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={t('preview')}
                className="h-full w-full object-cover"
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </div>
          ) : (
            <UserAvatar user={user} size="xl" linkDisabled className="h-24 w-24" />
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-1 flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t('hint', { maxSize: MAX_FILE_SIZE_MB })}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUploadClick}
              disabled={isDisabled}
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              {hasImage ? t('actions.change') : t('actions.upload')}
            </Button>

            {hasImage && !isUploading && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isDisabled}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('deleting')}
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('actions.delete')}
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('deleteDialog.description')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('deleteDialog.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t('deleteDialog.confirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        onChange={handleFileSelect}
        className="hidden"
        data-testid="file-input"
      />
    </section>
  );
}
