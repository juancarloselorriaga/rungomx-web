'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { useRouter } from '@/i18n/navigation';
import { checkOrgSlugAvailability, updateOrganization } from '@/lib/organizations/actions';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Check, Loader2, Save, Settings2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { DeleteOrganizationDialog } from './delete-organization-dialog';

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error' | 'unchanged';

type OrganizationSettingsFormProps = {
  organizationId: string;
  name: string;
  slug: string;
  canEdit: boolean;
};

type SettingsFormValues = {
  name: string;
  slug: string;
};

export function OrganizationSettingsForm({
  organizationId,
  name: initialName,
  slug: initialSlug,
  canEdit,
}: OrganizationSettingsFormProps) {
  const t = useTranslations('pages.dashboard.organizations');
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [slugStatus, setSlugStatus] = useState<SlugStatus>('unchanged');
  const slugTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slugRequestIdRef = useRef(0);

  const form = useForm<SettingsFormValues, { id: string; name: string; slug: string }>({
    defaultValues: { name: initialName, slug: initialSlug },
    onSubmit: async (values) => {
      if (slugStatus === 'taken') {
        return { ok: false, error: 'VALIDATION_ERROR', message: t('settings.errors.slugTaken') };
      }

      const result = await updateOrganization({
        organizationId,
        name: values.name.trim(),
        slug: values.slug.trim(),
      });

      if (!result.ok) {
        if (result.code === 'SLUG_TAKEN') {
          setSlugStatus('taken');
          return { ok: false, error: 'VALIDATION_ERROR', message: t('settings.errors.slugTaken') };
        }
        return { ok: false, error: 'SERVER_ERROR', message: result.error };
      }

      return { ok: true, data: result.data };
    },
    onSuccess: () => {
      toast.success(t('settings.success.toast'));
      setSlugStatus('unchanged');
      router.refresh();
    },
  });

  // Check slug availability with debounce
  async function checkSlug(slug: string) {
    if (slug === initialSlug) {
      setSlugStatus('unchanged');
      return;
    }

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

  function handleSlugChange(slug: string) {
    const sanitized = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    form.setFieldValue('slug', sanitized);
    // Debounce slug check
    if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current);
    slugTimeoutRef.current = setTimeout(() => checkSlug(sanitized), 400);
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current);
    };
  }, []);

  const hasChanges =
    form.values.name.trim() !== initialName || form.values.slug.trim() !== initialSlug;

  const slugStatusMessage = {
    idle: null,
    unchanged: null,
    checking: (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        {t('settings.slugStatus.checking')}
      </span>
    ),
    available: (
      <span className="flex items-center gap-1 text-green-600">
        <Check className="size-3" />
        {t('settings.slugStatus.available')}
      </span>
    ),
    taken: <span className="text-destructive">{t('settings.slugStatus.taken')}</span>,
    error: <span className="text-destructive">{t('settings.slugStatus.error')}</span>,
  };

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
      </div>

      <Form form={form} className="space-y-4">
        <FormError />

        <FormField
          label={
            <span className="text-sm font-medium text-foreground/80">
              {t('settings.fields.name.label')}
            </span>
          }
          required
          error={form.errors.name}
        >
          <input
            id="org-name"
            required
            type="text"
            autoComplete="organization"
            className={cn(
              'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
              'ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium',
              'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            )}
            placeholder={t('settings.fields.name.placeholder')}
            value={form.values.name}
            onChange={(e) => form.setFieldValue('name', e.target.value)}
            disabled={!canEdit || form.isSubmitting}
          />
        </FormField>

        <FormField
          label={
            <span className="text-sm font-medium text-foreground/80">
              {t('settings.fields.slug.label')}
            </span>
          }
          required
          error={form.errors.slug}
        >
          <input
            id="org-slug"
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
            placeholder={t('settings.fields.slug.placeholder')}
            value={form.values.slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            disabled={!canEdit || form.isSubmitting}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">{t('settings.fields.slug.hint')}</p>
            {slugStatusMessage[slugStatus]}
          </div>
        </FormField>

        {canEdit && (
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              className="w-full min-w-0 h-10 sm:h-8 sm:w-auto"
            >
              <Trash2 className="size-4" />
              {t('settings.buttons.delete')}
            </Button>

            <Button
              type="submit"
              size="sm"
              className="w-full min-w-0 h-10 sm:h-8 sm:w-auto"
              disabled={
                form.isSubmitting ||
                !hasChanges ||
                slugStatus === 'taken' ||
                slugStatus === 'checking' ||
                form.values.name.trim().length < 2 ||
                form.values.slug.length < 2
              }
              isLoading={form.isSubmitting}
              loadingPlacement="replace"
              loadingLabel={t('settings.buttons.saving')}
            >
              <Save className="size-4" />
              {t('settings.buttons.save')}
            </Button>
          </div>
        )}
      </Form>

      <DeleteOrganizationDialog
        open={deleteDialogOpen}
        onOpenChangeAction={setDeleteDialogOpen}
        organizationId={organizationId}
        organizationName={initialName}
      />
    </section>
  );
}
