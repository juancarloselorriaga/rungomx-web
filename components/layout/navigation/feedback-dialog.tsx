'use client';

import { submitContactSubmission } from '@/app/actions/contact-submission';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { LabeledTextarea } from '@/components/ui/labeled-textarea';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { navActionContainer, NavActionContent } from './nav-action';

interface FeedbackDialogProps {
  collapsed: boolean;
  label: string;
  icon: LucideIcon;
  iconSize?: number;
}

type FeedbackFormValues = {
  message: string;
  honeypot: string;
};

export function FeedbackDialog({
  collapsed,
  label,
  icon: Icon,
  iconSize = 20,
}: FeedbackDialogProps) {
  const t = useTranslations('components.feedback');
  const [open, setOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const form = useForm<FeedbackFormValues>({
    defaultValues: { message: '', honeypot: '' },
    onSubmit: async (values) => {
      const trimmedMessage = values.message.trim();
      if (!trimmedMessage) {
        return { ok: false, error: 'INVALID_INPUT', message: t('error') };
      }

      const metadata =
        typeof window !== 'undefined'
          ? {
              location: window.location.href,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }
          : undefined;

      const result = await submitContactSubmission({
        message: trimmedMessage,
        origin: 'feedback-dialog',
        honeypot: values.honeypot,
        metadata,
      });

      if (!result.ok) {
        if (result.error === 'RATE_LIMIT_EXCEEDED') {
          toast.error(t('rateLimitError'));
          return { ok: false, error: 'RATE_LIMIT_EXCEEDED', message: t('rateLimitError') };
        }
        if (result.error === 'EMAIL_FAILED') {
          toast.error(t('emailError'));
          return { ok: false, error: 'EMAIL_FAILED', message: t('emailError') };
        }
        if (result.error === 'INVALID_INPUT') {
          return { ok: false, error: 'INVALID_INPUT', message: t('error') };
        }
        return { ok: false, error: 'SERVER_ERROR', message: t('error') };
      }

      toast.success(t('success'));
      return { ok: true, data: null };
    },
    onSuccess: () => {
      form.reset();
      setOpen(false);
    },
    onError: () => {
      // toasts already shown; FormError will also render fallback message
    },
  });

  const handleOpenChange = useCallback(
    (value: boolean) => {
      setOpen(value);
      if (!value) {
        form.reset();
      }
    },
    [form],
  );

  useEffect(() => {
    if (!open) return;
    const handle = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(handle);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            navActionContainer(),
            'w-full flex justify-start text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
          title={collapsed ? label : undefined}
          aria-label={label}
          data-collapsed={collapsed}
        >
          <NavActionContent icon={Icon} label={label} collapsed={collapsed} iconSize={iconSize} />
        </Button>
      </DialogTrigger>

      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>
        <Form
          form={form}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          data-protonpass-ignore="true"
        >
          <FormError />
          <LabeledTextarea
            ref={textareaRef}
            id="feedback-message"
            name="feedback"
            label={t('prompt')}
            hint={t('hint')}
            placeholder={t('placeholder')}
            value={form.values.message}
            disabled={form.isSubmitting}
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
            data-protonpass-ignore="true"
            onChange={(event) => form.register('message').onChange(event)}
          />
          <div
            style={{
              position: 'absolute',
              left: '-9999px',
              width: '1px',
              height: '1px',
              overflow: 'hidden',
            }}
            aria-hidden="true"
          >
            <label htmlFor="feedback-website">Website</label>
            <input
              type="text"
              id="feedback-website"
              name="website"
              value={form.values.honeypot}
              onChange={(e) => form.register('honeypot').onChange(e)}
              tabIndex={-1}
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={!form.values.message.trim() || form.isSubmitting}>
              {form.isSubmitting ? `${t('send')}...` : t('send')}
            </Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
