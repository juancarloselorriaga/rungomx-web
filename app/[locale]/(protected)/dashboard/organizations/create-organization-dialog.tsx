'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { useRouter } from '@/i18n/navigation';
import { checkOrgSlugAvailability, createOrganization } from '@/lib/organizations/actions';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Building2, Check, Loader2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

type CreateOrganizationDialogProps = {
  open?: boolean;
  onOpenChangeAction?: (open: boolean) => void;
  onSuccessAction?: (orgId: string) => void;
};

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

type CreateOrgFormValues = {
  name: string;
  slug: string;
};

export function CreateOrganizationDialog({
  open,
  onOpenChangeAction,
  onSuccessAction,
}: CreateOrganizationDialogProps) {
  const t = useTranslations('pages.dashboard.organizations');
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const resolvedOpen = open ?? internalOpen;

  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
  const slugTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slugRequestIdRef = useRef(0);

  const form = useForm<CreateOrgFormValues, { id: string; name: string; slug: string }>({
    defaultValues: { name: '', slug: '' },
    onSubmit: async (values) => {
      if (slugStatus === 'taken') {
        return { ok: false, error: 'VALIDATION_ERROR', message: t('createDialog.errors.slugTaken') };
      }

      const result = await createOrganization({
        name: values.name.trim(),
        slug: values.slug.trim(),
      });

      if (!result.ok) {
        if (result.code === 'SLUG_TAKEN') {
          setSlugStatus('taken');
          return {
            ok: false,
            error: 'VALIDATION_ERROR',
            message: t('createDialog.errors.slugTaken'),
          };
        }
        return { ok: false, error: 'SERVER_ERROR', message: result.error };
      }

      return { ok: true, data: result.data };
    },
    onSuccess: (data) => {
      toast.success(t('createDialog.success.toast', { name: data.name }));
      handleOpenChange(false);
      onSuccessAction?.(data.id);
      router.push({ pathname: '/dashboard/organizations/[orgId]', params: { orgId: data.id } });
    },
  });

  // Check slug availability with debounce
  async function checkSlug(slug: string) {
    if (slug.length < 2) {
      setSlugStatus('idle');
      return;
    }

    setSlugStatus('checking');
    const requestId = ++slugRequestIdRef.current;

    try {
      const result = await checkOrgSlugAvailability(slug);
      // Only update if this is still the latest request
      if (requestId !== slugRequestIdRef.current) return;

      if (!result.ok) {
        setSlugStatus('error');
        return;
      }

      setSlugStatus(result.data.available ? 'available' : 'taken');
    } catch {
      if (requestId === slugRequestIdRef.current) {
        setSlugStatus('error');
      }
    }
  }

  function handleNameChange(name: string) {
    form.setFieldValue('name', name);
    // Auto-generate slug if not manually edited
    if (!slugManuallyEdited) {
      const newSlug = generateSlug(name);
      form.setFieldValue('slug', newSlug);
      // Debounce slug check
      if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current);
      slugTimeoutRef.current = setTimeout(() => checkSlug(newSlug), 400);
    }
  }

  function handleSlugChange(slug: string) {
    setSlugManuallyEdited(true);
    const sanitized = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    form.setFieldValue('slug', sanitized);
    // Debounce slug check
    if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current);
    slugTimeoutRef.current = setTimeout(() => checkSlug(sanitized), 400);
  }

  const handleOpenChange = (value: boolean) => {
    setInternalOpen(value);
    onOpenChangeAction?.(value);
    if (!value) {
      form.reset();
      setSlugManuallyEdited(false);
      setSlugStatus('idle');
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current);
    };
  }, []);

  const slugStatusMessage = {
    idle: null,
    checking: (
      <span className="flex items-center gap-1 text-muted-foreground text-xs">
        <Loader2 className="size-3 animate-spin" />
        {t('createDialog.slugStatus.checking')}
      </span>
    ),
    available: (
      <span className="flex items-center gap-1 text-green-600 text-xs">
        <Check className="size-3" />
        {t('createDialog.slugStatus.available')}
      </span>
    ),
    taken: <span className="text-destructive text-xs">{t('createDialog.slugStatus.taken')}</span>,
    error: <span className="text-destructive text-xs">{t('createDialog.slugStatus.error')}</span>,
  };

  return (
    <Dialog open={resolvedOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('createDialog.title')}</DialogTitle>
          <DialogDescription>{t('createDialog.description')}</DialogDescription>
        </DialogHeader>

        <Form form={form} className="space-y-4">
          <FormError />

          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <Building2 className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">{t('createDialog.banner.title')}</p>
              <p className="text-xs text-muted-foreground">{t('createDialog.banner.description')}</p>
            </div>
          </div>

          <FormField
            label={
              <span className="text-sm font-medium text-foreground/80">
                {t('createDialog.fields.name.label')}
              </span>
            }
            required
            error={form.errors.name}
          >
            <input
              id="name"
              required
              type="text"
              autoComplete="organization"
              className={cn(
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                'ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium',
                'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              )}
              placeholder={t('createDialog.fields.name.placeholder')}
              value={form.values.name}
              onChange={(e) => handleNameChange(e.target.value)}
              disabled={form.isSubmitting}
            />
          </FormField>

          <FormField
            label={
              <span className="text-sm font-medium text-foreground/80">
                {t('createDialog.fields.slug.label')}
              </span>
            }
            required
            error={form.errors.slug}
          >
            <input
              id="slug"
              required
              type="text"
              autoComplete="off"
              className={cn(
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono',
                'ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium',
                'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                slugStatus === 'taken' && 'border-destructive focus-visible:ring-destructive',
                slugStatus === 'available' && 'border-green-500 focus-visible:ring-green-500',
              )}
              placeholder={t('createDialog.fields.slug.placeholder')}
              value={form.values.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              disabled={form.isSubmitting}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">{t('createDialog.fields.slug.hint')}</p>
              {slugStatusMessage[slugStatus]}
            </div>
          </FormField>

          <DialogFooter className="flex justify-end gap-2 sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {t('createDialog.buttons.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                form.isSubmitting ||
                slugStatus === 'taken' ||
                slugStatus === 'checking' ||
                form.values.name.trim().length < 2 ||
                form.values.slug.length < 2
              }
              isLoading={form.isSubmitting}
              loadingPlacement="replace"
              loadingLabel={t('createDialog.buttons.creating')}
              className="justify-center min-w-[120px]"
            >
              <Plus className="size-4" />
              <span>{t('createDialog.buttons.create')}</span>
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
