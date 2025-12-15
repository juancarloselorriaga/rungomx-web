'use client';

import { updateAccountNameAction } from '@/app/actions/account';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

type AccountNameFormProps = {
  defaultName: string;
  email: string;
  variant?: 'default' | 'admin';
};

type NameFormValues = {
  name: string;
};

export function AccountNameForm({ defaultName, email, variant = 'default' }: AccountNameFormProps) {
  const t = useTranslations('components.settings.accountNameForm');
  const lastSavedNameRef = useRef(defaultName);
  const previousDefaultNameRef = useRef(defaultName);

  const form = useForm<NameFormValues, { name: string }>({
    defaultValues: { name: defaultName },
    onSubmit: async (values) => {
      const result = await updateAccountNameAction(values);

      if (!result.ok) {
        const fieldErrors =
          result.error === 'INVALID_INPUT' && 'fieldErrors' in result
            ? (result.fieldErrors ?? {})
            : {};
        const message =
          result.error === 'INVALID_INPUT' ? t('errors.invalidInput') : t('errors.save');

        const mappedFieldErrors: Record<string, string[]> = {};

        if (fieldErrors.name?.length) {
          mappedFieldErrors.name = [t('errors.name')];
        }

        return {
          ok: false,
          error: result.error,
          fieldErrors: Object.keys(mappedFieldErrors).length ? mappedFieldErrors : fieldErrors,
          message,
        };
      }

      return {
        ok: true,
        data: { name: result.data.name },
      };
    },
    onSuccess: ({ name }) => {
      form.setFieldValue('name', name);
      form.clearError('name');
      lastSavedNameRef.current = name;
      toast.success(t('success'));
    },
  });

  useEffect(() => {
    if (defaultName === previousDefaultNameRef.current) {
      return;
    }

    previousDefaultNameRef.current = defaultName;
    lastSavedNameRef.current = defaultName;
    form.setFieldValue('name', defaultName);
    form.clearError('name');
  }, [defaultName, form, form.clearError, form.setFieldValue]);

  const handleReset = () => {
    form.setFieldValue('name', lastSavedNameRef.current);
    form.clearError('name');
  };

  const isSubmitting = form.isSubmitting;

  return (
    <section className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('sectionLabel')}
        </p>
        <h2 className="text-lg font-semibold">{t(`title.${variant}`)}</h2>
        <p className="text-sm text-muted-foreground">{t(`description.${variant}`)}</p>
      </div>

      <Form form={form} className="space-y-4 border-t border-border/70 pt-4">
        <FormError />

        <div className="grid gap-3">
          <FormField label={t('fields.name')} required error={form.errors.name}>
            <input
              type="text"
              className={cn(
                'h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition',
                'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                form.errors.name && 'border-destructive focus-visible:border-destructive',
              )}
              {...form.register('name')}
              autoComplete="name"
              disabled={isSubmitting}
            />
          </FormField>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('fields.emailLabel')}
            </p>
            <p className="font-medium text-foreground">{email}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border/70 pt-4">
          <Button type="button" variant="outline" onClick={handleReset} disabled={isSubmitting}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {t('actions.save')}
          </Button>
        </div>
      </Form>
    </section>
  );
}
